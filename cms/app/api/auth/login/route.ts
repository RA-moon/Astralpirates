import { NextRequest, NextResponse } from 'next/server';

import { getPayloadInstance } from '@/app/lib/payload';
import type { User } from '@/payload-types';
import { sanitizeEmailInput } from '@/src/utils/email';
import {
  resolveHonorBadgeMediaByCode,
  sanitizePrivateProfile,
} from '../../profiles/_lib/sanitize';
import { applyCors, corsEmpty, corsJson } from '../../_lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LoginRequestBody = {
  email?: string;
  password?: string;
};

export async function POST(req: NextRequest) {
  const payload = await getPayloadInstance();

  let body: LoginRequestBody | null = null;
  try {
    body = (await req.json()) as LoginRequestBody;
  } catch {
    // ignore malformed JSON
  }

  const email = sanitizeEmailInput(body?.email);
  const password = body?.password;

  if (!email || !password) {
    return corsJson(req, { error: 'Email and password are required.' }, { status: 400 }, 'OPTIONS,POST');
  }

  try {
    const login = await payload.login({
      collection: 'users',
      data: { email, password },
    });

    if (!login?.token || !login.user) {
      return corsJson(req, { error: 'Invalid credentials.' }, { status: 401 }, 'OPTIONS,POST');
    }
    let sanitizedUser: User | null = null;

    try {
      const freshUser = await payload.findByID({
        collection: 'users',
        id: login.user.id,
        depth: 1,
        overrideAccess: true,
      });
      sanitizedUser = freshUser as User;
    } catch (error) {
      payload.logger.warn({ err: error, userId: login.user.id }, 'Failed to resolve login profile');
      sanitizedUser = login.user as User;
    }

    const honorBadgeMediaByCode = await resolveHonorBadgeMediaByCode({
      payload: payload as any,
      users: [sanitizedUser],
    });
    const profile = sanitizePrivateProfile(sanitizedUser, { payload, honorBadgeMediaByCode });
    const response = NextResponse.json({ user: profile, token: login.token, exp: login.exp });

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

    return applyCors(response, 'OPTIONS,POST', req);
  } catch (error) {
    payload.logger.warn({ err: error }, 'Login failed');
    return corsJson(req, { error: 'Invalid credentials.' }, { status: 401 }, 'OPTIONS,POST');
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, 'OPTIONS,POST');
}
