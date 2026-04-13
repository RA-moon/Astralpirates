import { randomUUID } from 'node:crypto';

import type { NextRequest } from 'next/server';
import { getPayloadInstance } from '@/app/lib/payload';

import { dispatchAuthMail } from '../_lib/authMailDispatch';
import { EMAIL_TRANSPORT_COOLDOWN_MS, REGISTRATION_TOKEN_TTL_MS } from '../_lib/authMailConfig';
import { corsEmpty, corsJson } from '../_lib/cors';
import { deriveInviteTokenIdentifiers } from '../_lib/invite';
import { buildRegisterURL, resolveRegisterUrlOptions } from '../_lib/register';
import {
  createRegistrationToken,
  revokeRegistrationTokens,
  type RegistrationTokenPurpose,
} from '../_lib/registrationTokens';
import { getEmailTransportStatus } from '../invitations/transportState';
import { renderPasswordResetEmail } from '@/src/emails/auth';
import { resolveClientFingerprint } from '@/src/utils/clientFingerprint';
import { sanitizeEmailInput } from '@/src/utils/email';
import { normalizeProfileSlugInput } from '@/src/utils/profileSlug';
import { evaluateIpRateLimit, evaluateUserRateLimit } from './rateLimiter';
import { refundElsa, spendElsa } from '@/src/services/elsaLedger';

export const runtime = 'nodejs';

const METHODS = 'OPTIONS,POST';
const DEFAULT_TOKEN_TTL_MS = REGISTRATION_TOKEN_TTL_MS;

type PasswordResetRequest = {
  callSign?: string;
  email?: string;
};

const sanitizeCallSignInput = (value?: string | null): { text: string; slug: string } | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 64) return null;
  const slug = normalizeProfileSlugInput(trimmed);
  if (!slug) return null;
  return { text: trimmed, slug };
};

export async function POST(req: NextRequest) {
  const payload = await getPayloadInstance();

  const transportStatus = await getEmailTransportStatus();
  if (transportStatus.offline) {
    return corsJson(
      req,
      {
        error: 'Password resets are temporarily unavailable while we reconnect the mail transport.',
        retryAt: transportStatus.retryAt,
        lastError: transportStatus.lastError,
      },
      { status: 503 },
      METHODS,
    );
  }

  let body: PasswordResetRequest | null = null;
  try {
    body = (await req.json()) as PasswordResetRequest;
  } catch {
    // fall through to validation errors
  }

  const email = sanitizeEmailInput(body?.email);
  const callSignInput = sanitizeCallSignInput(body?.callSign);

  if (!email || !callSignInput) {
    return corsJson(
      req,
      { error: 'Both call sign and a valid email are required.' },
      { status: 400 },
      METHODS,
    );
  }

  const clientFingerprint = resolveClientFingerprint(req);
  const userIdentifier = `${callSignInput.slug}:${email}`;

  const userRate = await evaluateUserRateLimit(userIdentifier);
  if (userRate.limited) {
    payload.logger.warn(
      {
        resetAudit: {
          status: 'rate_limited',
          scope: 'user',
          callSign: callSignInput.text,
          slug: callSignInput.slug,
          email,
          retryAt: userRate.retryAtIso,
        },
      },
      'Password reset blocked by per-user rate limit',
    );
    return corsJson(
      req,
      {
        error: 'Too many reset requests for this crew member. Try again later.',
        retryAt: userRate.retryAtIso,
      },
      { status: 429 },
      METHODS,
    );
  }

  const ipRate = await evaluateIpRateLimit(clientFingerprint);
  if (ipRate.limited) {
    payload.logger.warn(
      {
        resetAudit: {
          status: 'rate_limited',
          scope: 'ip',
          ip: clientFingerprint,
          callSign: callSignInput.text,
          email,
          retryAt: ipRate.retryAtIso,
        },
      },
      'Password reset blocked by IP rate limit',
    );
    return corsJson(
      req,
      {
        error: 'Too many password reset attempts from this network. Try again later.',
        retryAt: ipRate.retryAtIso,
      },
      { status: 429 },
      METHODS,
    );
  }

  const userResult = await payload.find({
    collection: 'users',
    where: {
      and: [
        { email: { equals: email } },
        {
          or: [
            { profileSlug: { equals: callSignInput.slug } },
            { callSign: { equals: callSignInput.text } },
          ],
        },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const targetUser = userResult.docs[0];
  if (!targetUser) {
    payload.logger.info(
      {
        resetAudit: {
          status: 'ignored',
          reason: 'user_not_found',
          callSign: callSignInput.text,
          slug: callSignInput.slug,
          email,
        },
      },
      'Password reset requested for unknown user',
    );
    return corsJson(req, { message: 'Reset link sent if the account exists.' }, {}, METHODS);
  }

  let refundResult: Awaited<ReturnType<typeof refundElsa>> | null = null;
  let tokenDoc: Record<string, any> | null = null;
  let inviteStatePersisted = false;

  try {
    const inviteState = (targetUser as any).invite ?? {};
    const invitePurpose: RegistrationTokenPurpose =
      inviteState?.purpose === 'password_reset' ? 'password_reset' : 'recruit';
    const [existingTokenId, existingTokenValue] = deriveInviteTokenIdentifiers(inviteState);

    const hasPendingEmail = typeof inviteState?.email === 'string' && inviteState.email.length > 0;
    const hasBeenRedeemed =
      typeof inviteState?.redeemedAt === 'string' && inviteState.redeemedAt.length > 0;
    const shouldRefundElsa = invitePurpose === 'recruit' && hasPendingEmail && !hasBeenRedeemed;

    const tokenValue = randomUUID();
    const expiresAt = new Date(Date.now() + DEFAULT_TOKEN_TTL_MS);
    const expiresAtIso = expiresAt.toISOString();
    tokenDoc = await createRegistrationToken(payload, {
      email,
      firstName: targetUser.firstName as string,
      lastName: targetUser.lastName as string,
      token: tokenValue,
      expiresAt: expiresAtIso,
      purpose: 'password_reset',
      targetUser: targetUser.id,
    });

    const resetLink = buildRegisterURL(tokenValue, resolveRegisterUrlOptions(req.headers));
    const expiresOn = expiresAt.toUTCString();
    const emailContent = renderPasswordResetEmail({
      firstName: typeof targetUser.firstName === 'string' ? targetUser.firstName : '',
      lastName: typeof targetUser.lastName === 'string' ? targetUser.lastName : '',
      resetLink,
      expiresAt: expiresOn,
    });

    await dispatchAuthMail({
      payload,
      to: email,
      content: emailContent,
      cooldownMs: EMAIL_TRANSPORT_COOLDOWN_MS,
    });

    if (shouldRefundElsa) {
      try {
        refundResult = await refundElsa({
          payload,
          userId: targetUser.id as number,
          amount: 1,
          type: 'refund',
          metadata: {
            reason: 'password_reset_refund',
            targetUser: targetUser.id,
            tokenId: tokenDoc?.id ?? null,
          },
          idempotencyKey: tokenDoc?.id ? `password-reset-refund:${tokenDoc.id}` : undefined,
        });
      } catch (refundError) {
        payload.logger.error(
          { err: refundError, userId: targetUser.id, tokenId: tokenDoc?.id ?? null },
          '[password-reset] Failed to refund E.L.S.A. before updating invite',
        );
        throw refundError;
      }
    }

    const invitePayload: Record<string, unknown> = {
      purpose: 'password_reset',
      targetUser: targetUser.id,
      firstName: targetUser.firstName ?? null,
      lastName: targetUser.lastName ?? null,
      email,
      callSignSnapshot: callSignInput.text,
      profileSlugSnapshot: callSignInput.slug,
      tokenId: String(tokenDoc.id),
      token: tokenValue,
      sentAt: new Date().toISOString(),
      expiresAt: expiresAtIso,
      redeemedAt: null,
      invitedUser: null,
      linkHidden: true,
    };

    const updateData: Record<string, unknown> = {
      invite: invitePayload,
    };
    if (refundResult) {
      updateData.elsaTokens = refundResult.balanceAfter;
    }

    await payload.update({
      collection: 'users',
      id: targetUser.id,
      data: updateData,
      overrideAccess: true,
    });
    inviteStatePersisted = true;

    // Revoke previous links only after the new reset state is durable.
    try {
      await revokeRegistrationTokens(
        payload,
        {
          tokenId: existingTokenId,
          token: existingTokenValue,
          purposes: [invitePurpose],
          onlyUnused: false,
          limit: 10,
        },
        {
          warnContext: { userId: targetUser.id },
          warnLabel: '[password-reset] Failed to delete existing invite/reset token',
        },
      );
      await revokeRegistrationTokens(
        payload,
        {
          targetUserId: targetUser.id as number,
          purposes: ['password_reset'],
          excludeTokenId: tokenDoc?.id ?? null,
          onlyUnused: true,
          limit: 25,
        },
        {
          warnContext: { userId: targetUser.id },
          warnLabel: '[password-reset] Failed to revoke existing reset tokens',
        },
      );
    } catch (cleanupError) {
      payload.logger.warn(
        { err: cleanupError, userId: targetUser.id, tokenId: tokenDoc?.id ?? null },
        '[password-reset] Failed to revoke older reset/invite tokens after issuance',
      );
    }

    payload.logger.info(
      {
        resetAudit: {
          status: 'sent',
          userId: targetUser.id,
          email,
          callSign: targetUser.callSign ?? null,
          refundedElsa: Boolean(refundResult?.applied),
          expiresAt: expiresAtIso,
        },
      },
      'Password reset dispatched',
    );

    return corsJson(req, { message: 'Reset link sent.' }, {}, METHODS);
  } catch (error) {
    payload.logger.error(
      { err: error, userId: targetUser.id },
      'Failed to process password reset request',
    );
    if (!inviteStatePersisted && tokenDoc?.id != null) {
      await revokeRegistrationTokens(
        payload,
        { tokenId: tokenDoc.id, onlyUnused: false, limit: 1 },
        {
          warnContext: { userId: targetUser.id },
          warnLabel: '[password-reset] Failed to clean up token after reset request failure',
        },
      );
    }
    if (refundResult?.applied) {
      try {
        await spendElsa({
          payload,
          userId: targetUser.id as number,
          amount: 1,
          type: 'spend',
          metadata: {
            reason: 'password_reset_refund_rollback',
            tokenId: tokenDoc?.id ?? null,
          },
          idempotencyKey: tokenDoc?.id
            ? `password-reset-refund-rollback:${tokenDoc.id}`
            : undefined,
        });
      } catch (rollbackError) {
        payload.logger.error(
          { err: rollbackError, userId: targetUser.id, tokenId: tokenDoc?.id ?? null },
          '[password-reset] Failed to rollback refunded E.L.S.A. after error',
        );
      }
    }
    return corsJson(
      req,
      { error: 'Unable to issue a password reset link right now.' },
      { status: 500 },
      METHODS,
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
