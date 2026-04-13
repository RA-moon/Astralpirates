import { NextRequest, NextResponse } from 'next/server';

import { getPayloadInstance } from '@/app/lib/payload';
import {
  CAPTAIN_ROLE,
  DEFAULT_CREW_ROLE,
  resolveInviteeCrewRole,
  type CrewRole,
} from '@astralpirates/shared/crewRoles';
import { makeProfileSlugFromCallSign, makeTemporaryProfileSlug } from '@/src/utils/profileSlug';
import { applyCors, corsEmpty, corsJson } from '../../../_lib/cors';
import {
  clearInviteState,
  deriveInviteTokenIdentifiers,
  resolveRelationId,
  sanitizeInviteName,
} from '@/app/api/_lib/invite';
import { grantElsa } from '@/src/services/elsaLedger';
import { sanitizeEmailInput } from '@/src/utils/email';
import { resolveCaptainInviterId } from '@/src/utils/invitedBy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const invalidResponse = (req: NextRequest) =>
  corsJson(req, { error: 'Registration link is invalid or expired.' }, { status: 400 }, 'OPTIONS,GET,POST');

type RouteParams = { params: Promise<{ token: string }> };

type CompleteRegistrationBody = {
  email?: string;
  firstName?: string;
  lastName?: string;
  callSign?: string;
  password?: string;
  confirmPassword?: string;
};

const sanitizeCallSign = (value: string | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 2 || trimmed.length > 48) return null;
  if (!/^[\p{L}\p{N}'\-\s]+$/u.test(trimmed)) return null;
  return trimmed;
};

const normalizeLowerTrim = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase();
};

const determineInitialCrewRole = async (
  payload: Awaited<ReturnType<typeof getPayloadInstance>>,
  inviterId: number | null,
): Promise<{ initialRole: CrewRole; inviterRole: CrewRole | null }> => {
  if (typeof inviterId !== 'number') {
    return { initialRole: DEFAULT_CREW_ROLE, inviterRole: null };
  }

  try {
    const inviterDoc = await payload.findByID({
      collection: 'users',
      id: inviterId,
      depth: 0,
      overrideAccess: true,
    });

    const inviterRole =
      typeof (inviterDoc as any)?.role === 'string' ? ((inviterDoc as any).role as CrewRole) : null;

    return {
      initialRole: resolveInviteeCrewRole(inviterRole),
      inviterRole,
    };
  } catch (error) {
    payload.logger.warn(
      { err: error, inviterId },
      'Failed to resolve inviter role while determining initial crew role',
    );
    return { initialRole: DEFAULT_CREW_ROLE, inviterRole: null };
  }
};

const markInviteRedeemed = async (
  payload: Awaited<ReturnType<typeof getPayloadInstance>>,
  inviterId: number,
  email: string,
  tokenDoc: Record<string, any>,
  newUserId: number,
  firstName: string,
  lastName: string,
) => {
  try {
    const inviterDoc = await payload.findByID({
      collection: 'users',
      id: inviterId,
      depth: 0,
      overrideAccess: true,
    });

    const invite = (inviterDoc as any).invite ?? {};
    const sentAt =
      typeof invite?.sentAt === 'string'
        ? invite.sentAt
        : typeof tokenDoc?.createdAt === 'string'
          ? tokenDoc.createdAt
          : null;
    const stamp = new Date().toISOString();
    const updatedInvite: Record<string, unknown> = {
      ...clearInviteState(),
      sentAt,
      redeemedAt: stamp,
      invitedUser: newUserId,
      purpose: 'recruit',
    };

    await payload.update({
      collection: 'users',
      id: inviterId,
      data: {
        invite: updatedInvite,
      },
      overrideAccess: true,
    });
  } catch (error) {
    payload.logger.warn({ err: error, inviterId }, 'Failed to mark invite as redeemed');
  }
};

const loadTokenDoc = async (token: string) => {
  const payload = await getPayloadInstance();
  const tokenDocs = await payload.find({
    collection: 'registration-tokens',
    where: { token: { equals: token } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  });

  const tokenDoc = tokenDocs.docs[0];
  if (!tokenDoc) return { payload, tokenDoc: null } as const;
  if (tokenDoc.used) return { payload, tokenDoc: null } as const;
  if (new Date(tokenDoc.expiresAt) < new Date()) return { payload, tokenDoc: null } as const;
  return { payload, tokenDoc } as const;
};

const buildAuthResponse = (
  req: NextRequest,
  payload: Awaited<ReturnType<typeof getPayloadInstance>>,
  login: { token?: string | null; user?: unknown; exp?: number | null } | null,
  status: number,
  fallbackBody?: Record<string, unknown> | null,
) => {
  if (!login?.token || !login.user) {
    payload.logger.warn('Authentication succeeded but issuing a login token failed');
    const responseBody = fallbackBody ?? { user: login?.user ?? null };
    return corsJson(req, responseBody, { status }, 'OPTIONS,GET,POST');
  }

  const response = NextResponse.json(
    { user: login.user, token: login.token, exp: login.exp },
    { status },
  );
  const cookiePrefix = payload.config.cookiePrefix ?? 'payload';
  const cookieName = `${cookiePrefix}-token`;
  const secure = payload.config.serverURL?.startsWith('https://') ?? false;
  const expiry = login.exp ? new Date(login.exp * 1000) : undefined;

  response.cookies.set(cookieName, login.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: expiry,
  });

  return applyCors(response, 'OPTIONS,GET,POST', req);
};

type PasswordResetSubmission = {
  req: NextRequest;
  payload: Awaited<ReturnType<typeof getPayloadInstance>>;
  tokenDoc: Record<string, any>;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
};

const completePasswordReset = async ({
  req,
  payload,
  tokenDoc,
  email,
  firstName,
  lastName,
  password,
}: PasswordResetSubmission) => {
  const targetUserId = resolveRelationId(tokenDoc.targetUser);
  if (targetUserId == null) {
    return invalidResponse(req);
  }

  let userDoc: Record<string, any>;
  try {
    userDoc = (await payload.findByID({
      collection: 'users',
      id: targetUserId,
      depth: 0,
      overrideAccess: true,
    })) as Record<string, any>;
  } catch (error) {
    payload.logger.warn(
      { err: error, targetUserId },
      'Failed to load target user while processing password reset',
    );
    return invalidResponse(req);
  }

  const userEmail =
    typeof userDoc.email === 'string' ? userDoc.email.trim().toLowerCase() : null;
  if (!userEmail || userEmail !== email) {
    return corsJson(
      req,
      { error: 'Email does not match this reset request.' },
      { status: 400 },
      'OPTIONS,GET,POST',
    );
  }

  const inviteState = userDoc?.invite ?? {};
  const invitePurpose =
    typeof inviteState?.purpose === 'string' ? inviteState.purpose : 'recruit';
  if (invitePurpose !== 'password_reset') {
    return invalidResponse(req);
  }

  const [inviteTokenId, inviteTokenValue] = deriveInviteTokenIdentifiers(inviteState);
  if (
    (inviteTokenValue && inviteTokenValue !== tokenDoc.token) ||
    (!inviteTokenValue && inviteTokenId != null && inviteTokenId !== tokenDoc.id)
  ) {
    return invalidResponse(req);
  }

  const inviteEmailSnapshot =
    typeof inviteState?.email === 'string' ? inviteState.email.trim().toLowerCase() : null;
  if (inviteEmailSnapshot && inviteEmailSnapshot !== email) {
    return corsJson(
      req,
      { error: 'Email does not match this reset request.' },
      { status: 400 },
      'OPTIONS,GET,POST',
    );
  }

  const inviteFirst = sanitizeInviteName(
    typeof inviteState?.firstName === 'string' ? inviteState.firstName : undefined,
  );
  if (inviteFirst && inviteFirst.toLowerCase() !== firstName.toLowerCase()) {
    return corsJson(
      req,
      { error: 'First name does not match this reset request.' },
      { status: 400 },
      'OPTIONS,GET,POST',
    );
  }

  const inviteLast = sanitizeInviteName(
    typeof inviteState?.lastName === 'string' ? inviteState.lastName : undefined,
  );
  if (inviteLast && inviteLast.toLowerCase() !== lastName.toLowerCase()) {
    return corsJson(
      req,
      { error: 'Surname does not match this reset request.' },
      { status: 400 },
      'OPTIONS,GET,POST',
    );
  }

  const inviteCallSignSnapshot = normalizeLowerTrim(inviteState?.callSignSnapshot);
  const currentCallSign = normalizeLowerTrim(userDoc?.callSign);
  if (inviteCallSignSnapshot && inviteCallSignSnapshot !== currentCallSign) {
    return corsJson(
      req,
      { error: 'Account details changed since this reset link was issued. Request a new reset link.' },
      { status: 400 },
      'OPTIONS,GET,POST',
    );
  }

  const inviteProfileSlugSnapshot = normalizeLowerTrim(inviteState?.profileSlugSnapshot);
  const currentProfileSlug = normalizeLowerTrim(userDoc?.profileSlug);
  if (inviteProfileSlugSnapshot && inviteProfileSlugSnapshot !== currentProfileSlug) {
    return corsJson(
      req,
      { error: 'Account details changed since this reset link was issued. Request a new reset link.' },
      { status: 400 },
      'OPTIONS,GET,POST',
    );
  }

  try {
    await payload.update({
      collection: 'users',
      id: userDoc.id,
      data: {
        password,
        invite: clearInviteState(),
        resetPasswordToken: null,
        resetPasswordExpiration: null,
        sessions: [],
        loginAttempts: 0,
        lockUntil: null,
      },
      overrideAccess: true,
    });
  } catch (error) {
    payload.logger.error({ err: error, userId: userDoc.id }, 'Failed to update password');
    return corsJson(
      req,
      { error: 'Unable to update password right now.' },
      { status: 500 },
      'OPTIONS,GET,POST',
    );
  }

  try {
    await payload.update({
      collection: 'registration-tokens',
      id: tokenDoc.id,
      data: { used: true },
      overrideAccess: true,
    });
  } catch (error) {
    payload.logger.warn({ err: error, tokenId: tokenDoc.id }, 'Failed to mark reset token as used');
  }

  const login = await payload.login({
    collection: 'users',
    data: { email, password },
  });

  return buildAuthResponse(req, payload, login, 200);
};

export async function GET(req: NextRequest, context: RouteParams) {
  const { token } = await context.params;
  const { payload, tokenDoc } = await loadTokenDoc(token);

  if (!tokenDoc) {
    return invalidResponse(req);
  }

  const purpose = tokenDoc.purpose === 'password_reset' ? 'password_reset' : 'recruit';

  return corsJson(
    req,
    {
      purpose,
      email: tokenDoc.email,
      firstName: tokenDoc.firstName ?? null,
      lastName: tokenDoc.lastName ?? null,
    },
    {},
    'OPTIONS,GET,POST',
  );
}

export async function POST(req: NextRequest, context: RouteParams) {
  const { token } = await context.params;
  const { payload, tokenDoc } = await loadTokenDoc(token);

  if (!tokenDoc) {
    return invalidResponse(req);
  }

  let body: CompleteRegistrationBody | null = null;
  try {
    body = (await req.json()) as CompleteRegistrationBody;
  } catch {
    // fall through to validation error below
  }

  const password = body?.password ?? '';
  const confirmPassword = body?.confirmPassword ?? '';
  if (password.length < 8) {
    return corsJson(req, { error: 'Password must be at least 8 characters.' }, { status: 400 }, 'OPTIONS,GET,POST');
  }

  if (password !== confirmPassword) {
    return corsJson(req, { error: 'Passwords do not match.' }, { status: 400 }, 'OPTIONS,GET,POST');
  }

  const providedEmail = sanitizeEmailInput(body?.email);
  if (!providedEmail) {
    return corsJson(req, { error: 'Valid email is required.' }, { status: 400 }, 'OPTIONS,GET,POST');
  }

  if (providedEmail !== tokenDoc.email) {
    return corsJson(req, { error: 'Email does not match this invitation.' }, { status: 400 }, 'OPTIONS,GET,POST');
  }

  const firstName = sanitizeInviteName(body?.firstName);
  const lastName = sanitizeInviteName(body?.lastName);

  if (!firstName || !lastName) {
    return corsJson(
      req,
      { error: 'First name and surname are required and must use letters only.' },
      { status: 400 },
      'OPTIONS,GET,POST',
    );
  }

  const expectedFirst = sanitizeInviteName(
    typeof tokenDoc.firstName === 'string' ? tokenDoc.firstName : undefined,
  );
  const expectedLast = sanitizeInviteName(
    typeof tokenDoc.lastName === 'string' ? tokenDoc.lastName : undefined,
  );

  if (expectedFirst && expectedFirst.toLowerCase() !== firstName.toLowerCase()) {
    return corsJson(req, { error: 'First name does not match the invitation.' }, { status: 400 }, 'OPTIONS,GET,POST');
  }

  if (expectedLast && expectedLast.toLowerCase() !== lastName.toLowerCase()) {
    return corsJson(req, { error: 'Surname does not match the invitation.' }, { status: 400 }, 'OPTIONS,GET,POST');
  }

  const tokenPurpose = tokenDoc.purpose === 'password_reset' ? 'password_reset' : 'recruit';
  if (tokenPurpose === 'password_reset') {
    return completePasswordReset({
      req,
      payload,
      tokenDoc,
      email: providedEmail,
      firstName,
      lastName,
      password,
    });
  }

  const callSign = sanitizeCallSign(body?.callSign);
  if (!callSign) {
    return corsJson(
      req,
      { error: 'Call sign must be 2-48 characters, using only letters, numbers, spaces, apostrophes, or hyphens.' },
      { status: 400 },
      'OPTIONS,GET,POST',
    );
  }

  try {
    const slug = makeProfileSlugFromCallSign(callSign);
    const existingCallSign = await payload.find({
      collection: 'users',
      where: { profileSlug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (existingCallSign.totalDocs > 0) {
      return corsJson(
        req,
        { error: 'That call sign is already in use. Choose a different one.' },
        { status: 409 },
        'OPTIONS,GET,POST',
      );
    }
  } catch (error) {
    payload.logger.warn({ err: error, token }, 'Failed to validate call sign availability');
    return corsJson(req, { error: 'Unable to validate call sign availability.' }, { status: 500 }, 'OPTIONS,GET,POST');
  }

  const email = providedEmail;
  let inviterId = resolveRelationId(tokenDoc.inviter);
  if (inviterId == null) {
    inviterId = await resolveCaptainInviterId(payload);
    if (inviterId == null) {
      payload.logger.warn(
        { tokenId: tokenDoc.id, token, email: providedEmail },
        'Recruit registration token has no inviter and no captain fallback is available',
      );
      return invalidResponse(req);
    }
  }

  try {
    const existingUser = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
    });

    if (existingUser.totalDocs > 0) {
      return corsJson(req, { error: 'Account already exists.' }, { status: 400 }, 'OPTIONS,GET,POST');
    }

    const { initialRole, inviterRole } = await determineInitialCrewRole(payload, inviterId);
    const initialElsaTokens = inviterRole === CAPTAIN_ROLE ? 3 : 0;

    const created = await payload.create({
      collection: 'users',
      data: {
        email,
        password,
        firstName,
        lastName,
        callSign,
        invitedBy: inviterId ?? undefined,
        role: initialRole,
        elsaTokens: 0,
        profileSlug: makeTemporaryProfileSlug(),
      },
      draft: false,
      overrideAccess: true,
    });

    if (initialElsaTokens > 0) {
      try {
        const grantResult = await grantElsa({
          payload,
          userId: created.id as number,
          amount: initialElsaTokens,
          type: 'grant',
          metadata: {
            reason: 'registration_grant',
            inviterId,
            tokenId: tokenDoc.id,
          },
          idempotencyKey: `registration-grant:${tokenDoc.id}`,
        });
        (created as any).elsaTokens = grantResult.balanceAfter;
      } catch (grantError) {
        payload.logger.error(
          { err: grantError, inviterId, userId: created.id },
          'Failed to grant starter E.L.S.A. during registration',
        );
        try {
          await payload.update({
            collection: 'users',
            id: created.id,
            data: { elsaTokens: initialElsaTokens },
            overrideAccess: true,
          });
          (created as any).elsaTokens = initialElsaTokens;
        } catch (fallbackError) {
          payload.logger.error(
            { err: fallbackError, inviterId, userId: created.id },
            'Failed to apply fallback E.L.S.A. balance during registration',
          );
        }
      }
    }

    await payload.update({
      collection: 'registration-tokens',
      id: tokenDoc.id,
      data: { used: true },
      overrideAccess: true,
    });

    if (typeof inviterId === 'number') {
      await markInviteRedeemed(
        payload,
        inviterId,
        email,
        tokenDoc,
        created.id as number,
        firstName,
        lastName,
      );
    }

    const login = await payload.login({
      collection: 'users',
      data: { email, password },
    });

    return buildAuthResponse(req, payload, login, 201, { user: created });
  } catch (error) {
    payload.logger.error({ err: error }, 'Failed to complete registration');
    return corsJson(req, { error: 'Unable to complete registration.' }, { status: 500 }, 'OPTIONS,GET,POST');
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, 'OPTIONS,GET,POST');
}
