import type { NextRequest } from 'next/server';

import { jwtVerify } from 'jose';
import { getPayloadInstance } from '@/app/lib/payload';
import type { User } from '@/payload-types';
import {
  resolveHonorBadgeMediaByCode,
  sanitizePrivateProfile,
} from '../../profiles/_lib/sanitize';
import { corsEmpty, corsJson } from '../../_lib/cors';

const METHODS = 'OPTIONS,GET';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normaliseExp = (value: unknown) => {
  if (typeof value === 'number') {
    return value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}

export async function GET(req: NextRequest) {
  const payload = await getPayloadInstance();

  try {
    const authHeader = req.headers.get('Authorization');
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : authHeader && authHeader.startsWith('JWT ')
          ? authHeader.slice('JWT '.length).trim()
          : null;

    const cookieHeader = req.headers.get('Cookie') ?? '';
    const cookiePrefix = payload.config.cookiePrefix ?? 'payload';
    const cookieToken = cookieHeader
      .split(';')
      .map((chunk) => chunk.trim())
      .find((chunk) => chunk.startsWith(`${cookiePrefix}-token=`))
      ?.slice(`${cookiePrefix}-token=`.length);

    let token = bearerToken || cookieToken || null;

    if (!token) {
      return corsJson(
        req,
        { error: 'Authentication required.' },
        {
          status: 401,
        },
        METHODS,
      );
    }

    const secretKey = new TextEncoder().encode(payload.secret);
    let jwtPayload: Record<string, unknown> | null = null;
    try {
      const verified = await jwtVerify(token, secretKey);
      jwtPayload = verified.payload as Record<string, unknown>;
    } catch (bearerError) {
      if (token === bearerToken && cookieToken) {
        try {
          token = cookieToken;
          const verified = await jwtVerify(token, secretKey);
          jwtPayload = verified.payload as Record<string, unknown>;
        } catch (cookieError) {
          payload.logger?.warn?.({ err: cookieError }, 'Session lookup failed');
          return corsJson(
            req,
            { error: 'Authentication required.' },
            {
              status: 401,
            },
            METHODS,
          );
        }
      } else {
        payload.logger?.warn?.({ err: bearerError }, 'Session lookup failed');
        return corsJson(
          req,
          { error: 'Authentication required.' },
          {
            status: 401,
          },
          METHODS,
        );
      }
    }
    if (!jwtPayload) {
      return corsJson(
        req,
        { error: 'Authentication required.' },
        {
          status: 401,
        },
        METHODS,
      );
    }

    const collectionSlug = String(jwtPayload.collection ?? 'users');
    const userId = jwtPayload.id;
    const sessionId = jwtPayload.sid;

    if (!userId) {
      return corsJson(
        req,
        { error: 'Authentication required.' },
        {
          status: 401,
        },
        METHODS,
      );
    }

    const collectionKey = collectionSlug as keyof typeof payload.collections;
    const collection = payload.collections[collectionKey] ?? payload.collections.users;

    let userDoc: User | null = null;

    try {
      userDoc = (await payload.findByID({
        collection: collection.config.slug,
        id: userId as number | string,
        depth: 1,
        overrideAccess: true,
      })) as User;
    } catch (error) {
      payload.logger?.warn?.({ err: error, userId }, 'Failed to resolve session profile');
      userDoc = null;
    }

    if (!userDoc) {
      return corsJson(
        req,
        { error: 'Authentication required.' },
        {
          status: 401,
        },
        METHODS,
      );
    }

    if (collection.config.auth?.useSessions) {
      const sessions = Array.isArray((userDoc as any)?.sessions) ? (userDoc as any).sessions : [];
      const hasSession = sessions.some((session: { id?: unknown }) => session?.id === sessionId);
      if (!hasSession) {
        return corsJson(
          req,
          { error: 'Authentication required.' },
          {
            status: 401,
          },
          METHODS,
        );
      }
    }

    const honorBadgeMediaByCode = await resolveHonorBadgeMediaByCode({
      payload: payload as any,
      users: [userDoc as User],
    });
    const profile = sanitizePrivateProfile(userDoc as User, { payload, honorBadgeMediaByCode });
    const expSeconds = normaliseExp(jwtPayload.exp ?? null);
    const exp = expSeconds ? String(expSeconds) : null;
    const expiresAt = expSeconds ? new Date(expSeconds * 1000).toISOString() : null;

    return corsJson(
      req,
      {
        token,
        user: profile,
        exp,
        expiresAt,
      },
      {},
      METHODS,
    );
  } catch (error) {
    payload.logger?.warn?.({ err: error }, 'Session lookup failed');
    return corsJson(
      req,
      { error: 'Unable to resolve session.' },
      {
        status: 500,
      },
      METHODS,
    );
  }
}
