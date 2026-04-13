import { randomUUID } from 'node:crypto';

import type { NextRequest } from 'next/server';
import type { Payload } from 'payload';
import {
  evaluateInviteRateLimit,
  INVITE_RATE_LIMIT_MAX,
  INVITE_RATE_LIMIT_WINDOW_MS,
} from './rateLimiter.ts';
import {
  getEmailTransportStatus,
} from './transportState.ts';

import { dispatchAuthMail } from '../_lib/authMailDispatch';
import { authenticateRequest, buildRequestForUser } from '../_lib/auth';
import { corsEmpty, corsJson } from '../_lib/cors';
import { EMAIL_TRANSPORT_COOLDOWN_MS, REGISTRATION_TOKEN_TTL_MS } from '../_lib/authMailConfig';
import { buildRegisterURL, resolveRegisterUrlOptions } from '../_lib/register';
import {
  createRegistrationToken,
  listRegistrationTokens,
  revokeRegistrationTokens,
} from '../_lib/registrationTokens';
import {
  formatInviteState,
  resolveElsaBalance,
  sanitizeInviteName,
  stringifyRelationId,
} from '../_lib/invite';
import { renderRecruitInviteEmail } from '@/src/emails/auth';
import { resolveClientFingerprint } from '@/src/utils/clientFingerprint';
import { sanitizeEmailInput } from '@/src/utils/email';
import { refundElsa, spendElsa } from '@/src/services/elsaLedger';

export const runtime = 'nodejs';

const METHODS = 'OPTIONS,GET,POST';
const DEFAULT_TOKEN_TTL_MS = REGISTRATION_TOKEN_TTL_MS;


type InviteAuditStatus = 'sent' | 'failed' | 'rate_limited';

const logInviteAudit = (
  payload: Payload,
  details: {
    status: InviteAuditStatus;
    inviterId: string | null;
    inviterEmail?: string | null;
    recruitEmail?: string | null;
    reason?: string;
    meta?: Record<string, unknown>;
  },
) => {
  const { status, inviterId, inviterEmail, recruitEmail, reason, meta } = details;
  const logEntry: Record<string, unknown> = {
    status,
    inviterId,
    inviterEmail,
    recruitEmail,
  };
  if (reason) {
    logEntry.reason = reason;
  }
  if (meta) {
    Object.assign(logEntry, meta);
  }

  if (status === 'sent') {
    payload.logger.info({ inviteAudit: logEntry }, 'Crew invite dispatched');
  } else if (status === 'rate_limited') {
    payload.logger.warn({ inviteAudit: logEntry }, 'Crew invite blocked by rate limiter');
  } else {
    payload.logger.error({ inviteAudit: logEntry }, 'Crew invite attempt failed');
  }
};


type InviteRequestBody = {
  email?: string;
  firstName?: string;
  lastName?: string;
};

export async function GET(req: NextRequest) {
  const { user } = await authenticateRequest(req);
  if (!user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const elsaBalance = resolveElsaBalance((user as any)?.elsaTokens);

  return corsJson(
    req,
    {
      invite: formatInviteState((user as any).invite),
      elsaTokens: elsaBalance,
    },
    {},
    METHODS,
  );
}

export async function POST(req: NextRequest) {
  const { payload, user } = await authenticateRequest(req);
  if (!user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const transportStatus = await getEmailTransportStatus();
  if (transportStatus.offline) {
    return corsJson(
      req,
      {
        error: 'Crew invitations are temporarily unavailable while we reconnect the mail transport.',
        retryAt: transportStatus.retryAt,
        lastError: transportStatus.lastError,
      },
      { status: 503 },
      METHODS,
    );
  }

  let body: InviteRequestBody | null = null;
  try {
    body = (await req.json()) as InviteRequestBody;
  } catch {
    // ignore malformed JSON; validation below will handle it
  }

  const email = sanitizeEmailInput(body?.email);
  if (!email) {
    return corsJson(req, { error: 'Valid email is required.' }, { status: 400 }, METHODS);
  }

  const firstName = sanitizeInviteName(body?.firstName);
  const lastName = sanitizeInviteName(body?.lastName);

  if (!firstName || !lastName) {
    return corsJson(
      req,
      { error: 'First name and surname are required and must use letters only.' },
      { status: 400 },
      METHODS,
    );
  }

  if (email === user.email) {
    return corsJson(req, { error: 'You cannot invite yourself.' }, { status: 400 }, METHODS);
  }

  const inviteState = (user as any).invite ?? {};
  const elsaBalance = resolveElsaBalance((user as any)?.elsaTokens);
  const existingInviteEmail = typeof inviteState.email === 'string' ? inviteState.email : null;
  const hasPendingInvite = Boolean(existingInviteEmail);

  if (hasPendingInvite && existingInviteEmail !== email) {
    return corsJson(
      req,
      { error: `You already invited ${existingInviteEmail}. Each crew member can invite one pirate.` },
      { status: 409 },
      METHODS,
    );
  }

  const shouldDeductElsa = !hasPendingInvite;
  if (shouldDeductElsa && elsaBalance <= 0) {
    return corsJson(req, { error: 'You have no E.L.S.A. remaining to enlist a new pirate.' }, { status: 403 }, METHODS);
  }

  const inviterIdValue =
    stringifyRelationId(user.id) ?? (user.id != null ? String(user.id) : null);
  const inviterEmail = typeof user.email === 'string' ? user.email : null;
  const clientFingerprint = resolveClientFingerprint(req);
  let spendResult: Awaited<ReturnType<typeof spendElsa>> | null = null;
  let tokenDoc: Record<string, any> | null = null;

  if (!inviterIdValue) {
    logInviteAudit(payload, {
      status: 'failed',
      inviterId: null,
      inviterEmail,
      recruitEmail: email,
      reason: 'missing_inviter_id',
      meta: { rawInviterId: user.id ?? null },
    });
    payload.logger.error(
      { inviterId: user.id },
      'Unable to resolve inviter ID while processing invite request',
    );
    return corsJson(
      req,
      { error: 'Unable to send invite right now.' },
      { status: 500 },
      METHODS,
    );
  }

  try {
    const existingUser = await payload.find({
      collection: 'users',
      where: {
        email: {
          equals: email,
        },
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    if (existingUser.totalDocs > 0) {
      return corsJson(
        req,
        { error: 'That crew member already has an account aboard the Astralpirates.' },
        { status: 409 },
        METHODS,
      );
    }

    const pendingTokens = await listRegistrationTokens(payload, {
      email,
      onlyUnused: true,
      limit: 100,
    });

    const conflictingToken = pendingTokens.find((doc) => {
      const tokenInviterId = stringifyRelationId((doc as any)?.inviter);
      if (tokenInviterId == null) return true;
      return tokenInviterId !== inviterIdValue;
    });

    if (conflictingToken) {
      return corsJson(
        req,
        { error: 'That recruit already has a pending invitation. Ask them to check their inbox.' },
        { status: 409 },
        METHODS,
      );
    }

    const inviterPendingTokens = pendingTokens.filter((doc) => {
      const tokenInviterId = stringifyRelationId((doc as any)?.inviter);
      return inviterIdValue && tokenInviterId === inviterIdValue;
    });

    const rateLimitKey = `${inviterIdValue}:${clientFingerprint}`;
    const rateCheck = await evaluateInviteRateLimit(rateLimitKey);
    if (rateCheck.limited) {
      logInviteAudit(payload, {
        status: 'rate_limited',
        inviterId: inviterIdValue,
        inviterEmail,
        recruitEmail: email,
        reason: 'rate_limit',
        meta: {
          retryAt: rateCheck.retryAtIso,
          fingerprint: clientFingerprint,
          windowMs: INVITE_RATE_LIMIT_WINDOW_MS,
          maxAttempts: INVITE_RATE_LIMIT_MAX,
        },
      });
      return corsJson(
        req,
        {
          error: 'You are sending invites too quickly. Try again after the cooldown.',
          retryAt: rateCheck.retryAtIso,
        },
        { status: 429 },
        METHODS,
      );
    }

    const localReq = await buildRequestForUser(payload, user);

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + DEFAULT_TOKEN_TTL_MS);
    const expiresAtIso = expiresAt.toISOString();

    tokenDoc = await createRegistrationToken(
      payload,
      {
        email,
        token,
        expiresAt: expiresAtIso,
        inviter: user.id,
        firstName,
        lastName,
        purpose: 'recruit',
        targetUser: null,
      },
      { req: localReq },
    );

    const tokenDocId =
      typeof tokenDoc.id === 'number' || typeof tokenDoc.id === 'string'
        ? tokenDoc.id
        : null;
    if (tokenDocId == null) {
      throw new Error('Invite token was created without an ID');
    }

    const tokenDocIdValue =
      typeof tokenDocId === 'number'
        ? tokenDocId
        : Number.isFinite(Number(tokenDocId))
          ? Number(tokenDocId)
          : tokenDocId;

    tokenDoc.id = tokenDocIdValue;

    const tokenDocIdString = String(tokenDocIdValue);
    const spendIdempotencyKey = `invite-send:${tokenDocIdString}`;

    const registerUrlOptions = resolveRegisterUrlOptions(req.headers);
    const registerURL = buildRegisterURL(token, registerUrlOptions);
    const inviterFullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    const inviterLabel = user.callSign || inviterFullName || user.email;

    const expiresOn = expiresAt.toUTCString();
    const emailContent = renderRecruitInviteEmail({
      firstName,
      lastName,
      inviterLabel,
      inviteLink: registerURL,
      expiresAt: expiresOn,
    });

    try {
      await dispatchAuthMail({
        payload,
        to: email,
        content: emailContent,
        cooldownMs: EMAIL_TRANSPORT_COOLDOWN_MS,
      });
    } catch (emailError) {
      await revokeRegistrationTokens(
        payload,
        { tokenId: tokenDocIdValue, onlyUnused: false, limit: 1 },
        {
          req: localReq,
          warnContext: { inviterId: user.id },
          warnLabel: 'Failed to roll back invite token after email failure',
        },
      );
      throw emailError;
    }

    for (const doc of inviterPendingTokens) {
      await revokeRegistrationTokens(
        payload,
        { tokenId: doc.id, onlyUnused: false, limit: 1 },
        {
          req: localReq,
          warnContext: { inviterId: user.id },
          warnLabel: 'Failed to remove stale invite token after reissue',
        },
      );
    }

    if (shouldDeductElsa) {
      try {
        spendResult = await spendElsa({
          payload,
          userId: user.id,
          amount: 1,
          type: 'spend',
          metadata: {
            reason: 'invite_send',
            email,
            tokenId: tokenDocIdValue,
          },
          idempotencyKey: spendIdempotencyKey,
        });
      } catch (error) {
        await revokeRegistrationTokens(payload, { tokenId: tokenDocIdValue, onlyUnused: false, limit: 1 }, { req: localReq });
        throw error;
      }
    }

    const nowISO = new Date().toISOString();
    const invitePayload: Record<string, unknown> = {
      purpose: 'recruit',
      firstName,
      lastName,
      email,
      callSignSnapshot: null,
      profileSlugSnapshot: null,
      tokenId: tokenDocIdString,
      token,
      sentAt: nowISO,
      expiresAt: expiresAtIso,
      redeemedAt: null,
      invitedUser: null,
      targetUser: null,
      linkHidden: true,
    };

    const updateData: Record<string, unknown> = {
      invite: invitePayload,
    };

    if (spendResult) {
      updateData.elsaTokens = spendResult.balanceAfter;
    }

    const updatedUser = await payload.update({
      collection: 'users',
      id: user.id,
      data: updateData,
      req: localReq,
      overrideAccess: true,
    });

    logInviteAudit(payload, {
      status: 'sent',
      inviterId: inviterIdValue,
      inviterEmail,
      recruitEmail: email,
      meta: {
        tokenId: tokenDocIdString,
        expiresAt: expiresAtIso,
        resend: Boolean(existingInviteEmail),
        remainingElsa: resolveElsaBalance((updatedUser as any)?.elsaTokens),
      },
    });

    return corsJson(
      req,
      {
        message: 'Invitation dispatched.',
        invite: formatInviteState(updatedUser.invite),
        elsaTokens: resolveElsaBalance((updatedUser as any)?.elsaTokens),
      },
      { status: existingInviteEmail ? 200 : 201 },
      METHODS,
    );
  } catch (error) {
    if (shouldDeductElsa && spendResult?.applied) {
      try {
        await refundElsa({
          payload,
          userId: user.id,
          amount: 1,
          type: 'refund',
          metadata: {
            reason: 'invite_send_refund',
            tokenId: tokenDoc?.id ?? null,
          },
          idempotencyKey:
            tokenDoc?.id != null ? `invite-send-refund:${String(tokenDoc.id)}` : undefined,
        });
      } catch (refundError) {
        payload.logger.error(
          { err: refundError, inviterId: user.id, tokenId: tokenDoc?.id ?? null },
          'Failed to refund E.L.S.A. after invite error',
        );
      }
    }
    logInviteAudit(payload, {
      status: 'failed',
      inviterId: inviterIdValue,
      inviterEmail,
      recruitEmail: email,
      reason: 'exception',
      meta: {
        message: error instanceof Error ? error.message : String(error),
      },
    });
    payload.logger.error({ err: error, inviterId: user.id }, 'Failed to dispatch crew invite');
    return corsJson(req, { error: 'Unable to send invite right now.' }, { status: 500 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
