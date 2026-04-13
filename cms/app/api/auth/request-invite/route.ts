import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';

import {
  EMAIL_TRANSPORT_COOLDOWN_MS,
  REGISTRATION_INVITE_LIMIT,
  REGISTRATION_TOKEN_TTL_MS,
} from '@/app/api/_lib/authMailConfig';
import { getPayloadInstance } from '@/app/lib/payload';
import { renderRequestInviteEmail } from '@/src/emails/auth';
import { sanitizeEmailInput } from '@/src/utils/email';
import { resolveClientFingerprint } from '@/src/utils/clientFingerprint';
import { resolveCaptainInviterId } from '@/src/utils/invitedBy';
import { dispatchAuthMail } from '../../_lib/authMailDispatch';
import { corsEmpty, corsJson } from '../../_lib/cors';
import { buildRegisterURL, resolveRegisterUrlOptions } from '../../_lib/register';
import { createRegistrationToken, revokeRegistrationTokens } from '../../_lib/registrationTokens';
import { getEmailTransportStatus } from '../../invitations/transportState';

const DEFAULT_TOKEN_TTL_MS = REGISTRATION_TOKEN_TTL_MS;
const DEFAULT_INVITE_LIMIT = REGISTRATION_INVITE_LIMIT;
const METHODS = 'OPTIONS,POST';
const INVITE_IP_ALLOWLIST = (process.env.REGISTRATION_INVITE_IP_ALLOWLIST ?? '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type InviteRequestBody = {
  email?: string;
};

const successMessage = {
  message: 'If the address is registered, instructions have been sent.',
};

export async function POST(req: NextRequest) {
  const payload = await getPayloadInstance();
  const transportStatus = await getEmailTransportStatus();
  if (transportStatus.offline) {
    return corsJson(
      req,
      {
        error: 'Invite requests are temporarily unavailable while we reconnect the mail transport.',
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
    // Ignore malformed JSON; the validation below will handle it.
  }

  const email = sanitizeEmailInput(body?.email);
  if (!email) {
    return corsJson(req, { error: 'Valid email is required.' }, { status: 400 }, METHODS);
  }

  const clientIP = resolveClientFingerprint(req);
  const userAgent = req.headers.get('user-agent') ?? undefined;
  const limit = Number.isFinite(DEFAULT_INVITE_LIMIT) && DEFAULT_INVITE_LIMIT > 0 ? DEFAULT_INVITE_LIMIT : 3;
  const ipIsAllowListed = INVITE_IP_ALLOWLIST.includes(clientIP);

  try {
    if (!ipIsAllowListed) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentRequests = await payload.find({
        collection: 'invite-requests',
        where: {
          and: [
            { ip: { equals: clientIP } },
            { createdAt: { greater_than_equal: since.toISOString() } },
          ],
        },
        limit: 1,
      });

      if (recentRequests.totalDocs >= limit) {
        payload.logger.warn(
          {
            authMailAudit: {
              purpose: 'request_invite',
              status: 'rate_limited',
              ip: clientIP,
              email,
            },
          },
          'Request-invite blocked by rate limit',
        );
        return corsJson(
          req,
          { error: 'Too many invite requests from this address. Try again later.' },
          { status: 429 },
          METHODS,
        );
      }
    }

    const existingUser = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
    });

    if (existingUser.totalDocs > 0) {
      payload.logger.info(
        {
          authMailAudit: {
            purpose: 'request_invite',
            status: 'ignored',
            reason: 'existing_user',
            email,
          },
        },
        'Request-invite ignored for existing user',
      );
      return corsJson(req, successMessage, {}, METHODS);
    }

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + DEFAULT_TOKEN_TTL_MS);
    const expiresAtIso = expiresAt.toISOString();
    const inviterId = await resolveCaptainInviterId(payload);
    if (inviterId == null) {
      payload.logger.error(
        {
          authMailAudit: {
            purpose: 'request_invite',
            status: 'failed',
            reason: 'missing_captain_inviter',
            email,
          },
        },
        'Request-invite blocked because no captain inviter could be resolved',
      );
      return corsJson(
        req,
        { error: 'Invite requests are temporarily unavailable. Please try again later.' },
        { status: 503 },
        METHODS,
      );
    }

    await revokeRegistrationTokens(
      payload,
      {
        email,
        purposes: ['recruit'],
        onlyUnused: true,
        limit: 100,
      },
      {
        warnContext: { ip: clientIP, email },
        warnLabel: 'Failed to clean up existing request-invite tokens',
      },
    );

    const tokenDoc = await createRegistrationToken(payload, {
      email,
      token,
      expiresAt: expiresAtIso,
      purpose: 'recruit',
      targetUser: null,
      inviter: inviterId,
      used: false,
    });

    const registerURL = buildRegisterURL(token, resolveRegisterUrlOptions(req.headers));
    const emailContent = renderRequestInviteEmail({
      inviteLink: registerURL,
      expiresAt: expiresAt.toUTCString(),
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
        { tokenId: tokenDoc.id, onlyUnused: false, limit: 1 },
        {
          warnContext: { tokenId: tokenDoc.id, email },
          warnLabel: 'Failed to clean up request-invite token after email failure',
        },
      );
      throw emailError;
    }

    try {
      await payload.create({
        collection: 'invite-requests',
        data: {
          ip: clientIP,
          userAgent,
          email,
        },
        draft: false,
        overrideAccess: true,
      });
    } catch (inviteRequestError) {
      payload.logger.warn(
        { err: inviteRequestError, ip: clientIP, email, tokenId: tokenDoc.id },
        'Failed to persist invite-request audit record after successful send',
      );
    }

    payload.logger.info(
      {
        authMailAudit: {
          purpose: 'request_invite',
          status: 'sent',
          email,
          tokenId: String(tokenDoc.id),
          expiresAt: expiresAtIso,
        },
      },
      'Request-invite email dispatched',
    );

    return corsJson(req, successMessage, {}, METHODS);
  } catch (error) {
    payload.logger.error({ err: error, email }, 'Failed to create registration invite');
    return corsJson(req, { error: 'Unable to process invite request.' }, { status: 500 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
