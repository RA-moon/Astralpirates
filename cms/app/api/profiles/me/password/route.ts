import type { NextRequest } from 'next/server';

import { buildRequestForUser, authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,POST';
const MIN_PASSWORD_LENGTH = 10;

type PasswordBody = {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

const normalizePassword = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export async function POST(req: NextRequest) {
  const { payload, user } = await authenticateRequest(req);
  if (!user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  let body: PasswordBody | null = null;
  try {
    body = (await req.json()) as PasswordBody;
  } catch (error) {
    return corsJson(req, { error: 'Invalid JSON payload.' }, { status: 400 }, METHODS);
  }

  const currentPassword = normalizePassword(body?.currentPassword);
  const newPassword = normalizePassword(body?.newPassword);
  const confirmPassword = normalizePassword(body?.confirmPassword);

  if (!currentPassword || !newPassword || !confirmPassword) {
    return corsJson(req, { error: 'All password fields are required.' }, { status: 400 }, METHODS);
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return corsJson(req, { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 }, METHODS);
  }

  if (newPassword !== confirmPassword) {
    return corsJson(req, { error: 'New passwords do not match.' }, { status: 400 }, METHODS);
  }

  if (newPassword === currentPassword) {
    return corsJson(req, { error: 'New password must be different from the current password.' }, { status: 400 }, METHODS);
  }

  try {
    await payload.login({
      collection: 'users',
      data: { email: user.email, password: currentPassword },
    });
  } catch (error) {
    return corsJson(req, { error: 'Current password is incorrect.' }, { status: 401 }, METHODS);
  }

  try {
    const reqForUser = await buildRequestForUser(payload, user);
    await payload.update({
      collection: 'users',
      id: user.id,
      data: { password: newPassword },
      req: reqForUser,
    });
    return corsJson(req, { message: 'Password updated successfully.' }, { status: 200 }, METHODS);
  } catch (error) {
    payload.logger.error({ err: error, userId: user.id }, 'Failed to update password');
    return corsJson(req, { error: 'Unable to update password.' }, { status: 500 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
