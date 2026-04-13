import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  hasAdminEditOverrideForUser,
  loadMembershipWithOwnerFallback,
  normaliseId,
  resolveFlightPlanBySlug,
  sanitizeFlightPlanSlug,
} from '@/app/api/_lib/flightPlanMembers';

const METHODS = 'OPTIONS,GET' as const;
const MAX_RESULTS = 5;

const sanitiseQuery = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  return trimmed;
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const { slug: rawSlug } = await context.params;
  const slug = sanitizeFlightPlanSlug(rawSlug);
  if (!slug) {
    return corsJson(req, { error: 'Invalid flight plan slug.' }, { status: 400 }, METHODS);
  }

  const flightPlanDoc = await resolveFlightPlanBySlug(auth.payload, slug);
  if (!flightPlanDoc) {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  const flightPlanId = normaliseId((flightPlanDoc as { id?: any })?.id);
  if (flightPlanId == null) {
    return corsJson(
      req,
      { error: 'Unable to resolve flight plan identifier.' },
      { status: 500 },
      METHODS,
    );
  }

  const ownerId = normaliseId((flightPlanDoc as { owner?: any })?.owner);
  const hasAdminEditOverride = hasAdminEditOverrideForUser({
    userId: auth.user.id,
    websiteRole: auth.user.role,
    adminMode: auth.adminMode,
  });
  if (!hasAdminEditOverride) {
    const membership = await loadMembershipWithOwnerFallback({
      payload: auth.payload,
      flightPlanId,
      userId: auth.user.id,
      ownerIdHint: ownerId ?? undefined,
    });
    if (
      !membership ||
      membership.status !== 'accepted' ||
      (membership.role !== 'owner' && membership.role !== 'crew')
    ) {
      return corsJson(
        req,
        { error: 'Only the captain or crew organisers can search for invitees unless captain admin edit mode is enabled.' },
        { status: 403 },
        METHODS,
      );
    }
  }

  const query = sanitiseQuery(req.nextUrl.searchParams.get('q'));
  if (!query) {
    return corsJson(req, { results: [] }, {}, METHODS);
  }

  try {
    const result = await auth.payload.find({
      collection: 'users',
      where: {
        and: [
          {
            profileSlug: {
              like: `${query}%`,
            },
          },
          {
            profileSlug: {
              exists: true,
            },
          },
        ],
      },
      limit: MAX_RESULTS,
      depth: 0,
      overrideAccess: true,
    });

    const results = (result.docs as any[]).map((doc) => ({
      id: normaliseId(doc?.id),
      callSign: typeof doc?.callSign === 'string' ? doc.callSign : null,
      profileSlug: typeof doc?.profileSlug === 'string' ? doc.profileSlug : null,
      role: typeof doc?.role === 'string' ? doc.role : null,
    }));

    return corsJson(req, { results }, {}, METHODS);
  } catch (error) {
    auth.payload.logger.warn(
      { err: error, flightPlanId, query, slug },
      'Failed to search flight plan invitees',
    );
    return corsJson(
      req,
      { error: 'Unable to complete search.' },
      { status: 500 },
      METHODS,
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
