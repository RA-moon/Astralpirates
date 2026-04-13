import type { NextRequest } from 'next/server';

import { authenticateRequest, buildRequestForUser } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';

const METHODS = 'OPTIONS,POST';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normaliseRoute = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('/')) {
    return `/${trimmed.replace(/^\/*/, '')}`;
  }
  return trimmed;
};

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}

export async function POST(req: NextRequest) {
  const { payload, user } = await authenticateRequest(req);
  if (!user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  let route: string | null = null;
  try {
    const body = await req.json();
    route = normaliseRoute((body as Record<string, unknown>)?.route);
  } catch {
    route = null;
  }

  const now = new Date().toISOString();
  const localReq = await buildRequestForUser(payload, user);

  try {
    await payload.db.updateOne({
      collection: 'users',
      id: user.id,
      data: {
        lastActiveAt: now,
        currentRoute: route,
        updatedAt: now,
      },
      req: localReq,
      returning: false,
    });
  } catch (error) {
    payload.logger?.warn?.({ err: error, userId: user.id }, 'Failed to record activity');
    return corsJson(
      req,
      { error: 'Unable to record activity.' },
      {
        status: 500,
      },
      METHODS,
    );
  }

  return corsJson(
    req,
    { ok: true, lastActiveAt: now, currentRoute: route },
    {},
    METHODS,
  );
}
