import type { NextRequest } from 'next/server';

import { getPayloadInstance } from '@/app/lib/payload';
import {
  disableRedirect,
  findActiveRedirect,
  type ProfileSlugRedirect,
} from '@/src/services/profileSlugRedirects';

import { corsEmpty, corsJson } from '../../_lib/cors';
import {
  resolveHonorBadgeMediaByCode,
  sanitizePublicProfile,
} from '../_lib/sanitize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const normalizeSlug = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[a-z0-9-]+$/.test(trimmed)) return null;
  return trimmed;
};

type CanonicalProfileResult = {
  profile: ReturnType<typeof sanitizePublicProfile> | null;
  redirectTo: string | null;
};

const findActiveProfile = async (payload: any, profileSlug: string) => {
  const result = await payload.find({
    collection: 'users',
    where: {
      profileSlug: {
        equals: profileSlug,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  return result.docs?.[0] ?? null;
};

const clearStaleRedirectChain = async (payload: any, redirectSlugs: string[]): Promise<void> => {
  if (!redirectSlugs.length) return;
  await Promise.all(redirectSlugs.map((fromSlug) => disableRedirect({ payload, fromSlug })));
};

const resolveCanonicalProfile = async (
  payload: any,
  requestedSlug: string,
): Promise<CanonicalProfileResult> => {
  const visited = new Set<string>();
  const redirectChain: ProfileSlugRedirect[] = [];
  let currentSlug = requestedSlug;

  for (let hops = 0; hops < 8; hops += 1) {
    if (visited.has(currentSlug)) {
      await clearStaleRedirectChain(
        payload,
        redirectChain.map((entry) => entry.fromSlug),
      );
      return { profile: null, redirectTo: null };
    }

    visited.add(currentSlug);

    const redirect = await findActiveRedirect({ payload, fromSlug: currentSlug });
    if (!redirect) break;

    const normalizedToSlug = normalizeSlug(redirect.toSlug);
    if (!normalizedToSlug) {
      await clearStaleRedirectChain(
        payload,
        [...redirectChain, redirect].map((entry) => entry.fromSlug),
      );
      return { profile: null, redirectTo: null };
    }

    redirectChain.push({
      ...redirect,
      toSlug: normalizedToSlug,
    });

    if (redirectChain.length > 1) {
      const canonicalTargetUserId = redirectChain[0]?.targetUserId;
      if (canonicalTargetUserId && redirect.targetUserId !== canonicalTargetUserId) {
        await clearStaleRedirectChain(
          payload,
          redirectChain.map((entry) => entry.fromSlug),
        );
        return { profile: null, redirectTo: null };
      }
    }

    currentSlug = normalizedToSlug;
  }

  const targetProfile = await findActiveProfile(payload, currentSlug);
  if (!targetProfile) {
    await clearStaleRedirectChain(
      payload,
      redirectChain.map((entry) => entry.fromSlug),
    );
    return { profile: null, redirectTo: null };
  }

  const canonicalTargetUserId = redirectChain[0]?.targetUserId;
  if (canonicalTargetUserId && canonicalTargetUserId !== targetProfile.id) {
    await clearStaleRedirectChain(
      payload,
      redirectChain.map((entry) => entry.fromSlug),
    );
    return { profile: null, redirectTo: null };
  }

  return {
    profile: sanitizePublicProfile(targetProfile, {
      payload,
      honorBadgeMediaByCode: await resolveHonorBadgeMediaByCode({
        payload: payload as any,
        users: [targetProfile],
      }),
    }),
    redirectTo: currentSlug === requestedSlug ? null : currentSlug,
  };
};

export async function GET(req: NextRequest, context: { params: Promise<{ slug?: string }> }) {
  const resolvedParams = await context.params;

  const requestedSlug = normalizeSlug(resolvedParams?.slug);
  if (!requestedSlug) {
    return corsJson(req, { error: 'Invalid profile slug.' }, { status: 400 }, 'OPTIONS,GET');
  }

  const payload = await getPayloadInstance();

  const directMatch = await payload.find({
    collection: 'users',
    where: {
      profileSlug: {
        equals: requestedSlug,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const directProfile = directMatch.docs?.[0] ?? null;
  if (directProfile) {
    const honorBadgeMediaByCode = await resolveHonorBadgeMediaByCode({
      payload: payload as any,
      users: [directProfile],
    });
    return corsJson(
      req,
      { profile: sanitizePublicProfile(directProfile, { payload, honorBadgeMediaByCode }) },
      {},
      'OPTIONS,GET',
    );
  }

  const resolvedProfile = await resolveCanonicalProfile(payload, requestedSlug);
  if (!resolvedProfile.profile) {
    return corsJson(req, { error: 'Profile not found.' }, { status: 404 }, 'OPTIONS,GET');
  }

  const responsePayload = {
    profile: resolvedProfile.profile,
    redirectTo: resolvedProfile.redirectTo
      ? {
          profileSlug: resolvedProfile.redirectTo,
        }
      : undefined,
  };

  const response = corsJson(req, responsePayload, { status: 200 }, 'OPTIONS,GET');
  if (resolvedProfile.redirectTo) {
    response.headers.set('X-Astral-Redirect', resolvedProfile.redirectTo);
  }

  return response;
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, 'OPTIONS,GET');
}
