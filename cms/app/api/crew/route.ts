import type { NextRequest } from 'next/server';

import type { User } from '@/payload-types';
import { authenticateRequest } from '../_lib/auth';

import { corsEmpty, corsJson } from '../_lib/cors';
import { buildAudienceUserWhere } from '../_lib/userAudience';
import { parseLimit, parsePage, sanitizeString } from '../_lib/requestParsing';
import {
  resolveHonorBadgeMediaByCode,
  sanitizePublicProfile,
} from '../profiles/_lib/sanitize';

const ONLINE_THRESHOLD_MS = 180_000;
const PUBLIC_MAX_LIMIT = 100;
const AUTHENTICATED_MAX_LIMIT = 200;

const METHODS = 'OPTIONS,GET';
const ACCESS_CLASS_PUBLIC = 'public';
const ACCESS_CLASS_AUTHENTICATED = 'authenticated';
type CrewAccessClass = typeof ACCESS_CLASS_PUBLIC | typeof ACCESS_CLASS_AUTHENTICATED;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS(req: NextRequest) {
  const response = corsEmpty(req, METHODS);
  response.headers.set('X-API-Access-Class', ACCESS_CLASS_PUBLIC);
  return response;
}

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const payload = auth.payload;
  const accessClass: CrewAccessClass = auth.user ? ACCESS_CLASS_AUTHENTICATED : ACCESS_CLASS_PUBLIC;
  const includeActivitySignals = accessClass === ACCESS_CLASS_AUTHENTICATED;

  const { searchParams } = req.nextUrl;
  const query = sanitizeString(searchParams.get('q'));
  const page = parsePage(searchParams.get('page'), 1);
  const maxLimit = includeActivitySignals ? AUTHENTICATED_MAX_LIMIT : PUBLIC_MAX_LIMIT;
  const limit = parseLimit(searchParams.get('limit'), query ? 50 : maxLimit, maxLimit);

  try {
    const searchFilters: Array<
      {
        profileSlug?: { like: string };
        callSign?: { like: string };
        firstName?: { like: string };
        lastName?: { like: string };
      }
    > = query
      ? [
          { profileSlug: { like: query } },
          { callSign: { like: query } },
          ...(includeActivitySignals
            ? [{ firstName: { like: query } }, { lastName: { like: query } }]
            : []),
        ]
      : [];
    const searchWhere = searchFilters.length ? { or: searchFilters } : undefined;

    const result = await payload.find({
      collection: 'users',
      limit,
      page,
      depth: 0,
      overrideAccess: true,
      select: {
        id: true,
        role: true,
        profileSlug: true,
        callSign: true,
        pronouns: true,
        avatar: true,
        avatarUrl: true,
        avatarMediaType: true,
        honorBadges: true,
        lastActiveAt: true,
        currentRoute: true,
        createdAt: true,
        updatedAt: true,
      },
      sort: query ? 'callSign' : 'profileSlug',
      where: buildAudienceUserWhere(searchWhere),
    });
    const users = result.docs.filter(
      (entry): entry is User => typeof (entry as User)?.profileSlug === 'string' && (entry as User).profileSlug.length > 0,
    );
    const honorBadgeMediaByCode = await resolveHonorBadgeMediaByCode({
      payload: payload as any,
      users,
    });

    const now = Date.now();

    const members = users
      .map((entry) => {
        const profile = sanitizePublicProfile(entry as User, { payload, honorBadgeMediaByCode });
        const baseMember = {
          id: profile.id,
          profileSlug: profile.profileSlug,
          displayName: profile.callSign ?? profile.profileSlug,
          callSign: profile.callSign,
          role: profile.role,
          pronouns: profile.pronouns,
          avatarUrl: profile.avatarUrl,
          avatarMediaType: profile.avatarMediaType,
          avatarMediaUrl: profile.avatarMediaUrl,
          avatarMimeType: profile.avatarMimeType,
          avatarFilename: profile.avatarFilename,
          honorBadges: profile.honorBadges,
        };

        if (!includeActivitySignals) return baseMember;

        const lastActiveAt = profile.lastActiveAt ?? null;
        const lastActiveMs = lastActiveAt ? Date.parse(lastActiveAt) : NaN;
        const isOnline = Number.isFinite(lastActiveMs) && now - lastActiveMs <= ONLINE_THRESHOLD_MS;

        return {
          ...baseMember,
          lastActiveAt,
          currentRoute: profile.currentRoute ?? null,
          isOnline,
        };
      });

    const response = corsJson(
      req,
      {
        members,
        pagination: {
          page: result.page ?? page,
          limit,
          totalDocs: result.totalDocs ?? members.length,
          totalPages: result.totalPages ?? 1,
        },
      },
      {},
      METHODS,
    );
    response.headers.set('X-API-Access-Class', accessClass);
    if (accessClass === ACCESS_CLASS_PUBLIC) {
      response.headers.set('Cache-Control', 'public, max-age=30');
    }
    return response;
  } catch (error) {
    payload.logger?.error?.({ err: error }, 'Failed to fetch crew manifest');
    const response = corsJson(
      req,
      { error: 'Unable to load crew manifest.' },
      {
        status: 500,
      },
      METHODS,
    );
    response.headers.set('X-API-Access-Class', accessClass);
    return response;
  }
}
