import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  hasAdminEditOverrideForUser,
  inviteMember,
  listMembershipsForFlightPlan,
  loadMembershipWithOwnerFallback,
  membershipIsAcceptedCrew,
  normaliseId,
  ownerCanInvite,
  resolveFlightPlanBySlug,
  sanitizeFlightPlanSlug,
  type FlightPlanMembershipRecord,
} from '@/app/api/_lib/flightPlanMembers';
import { canUserReadFlightPlan } from '@/app/api/_lib/accessPolicy';
import { notifyFlightPlanInvitationReceived } from '@/src/services/notifications/flightPlans';

const METHODS = 'OPTIONS,GET,POST' as const;

type MembershipFormatOptions = {
  sanitize?: boolean;
};

const formatMembership = (
  membership: FlightPlanMembershipRecord,
  invitee: any,
  inviter: any,
  options: MembershipFormatOptions = {},
) => {
  const formatted = {
    id: membership.id,
    flightPlanId: membership.flightPlanId,
    userId: membership.userId,
    role: membership.role,
    status: membership.status,
    invitedAt: membership.invitedAt,
    respondedAt: membership.respondedAt,
    user: invitee
      ? {
          id: normaliseId(invitee.id),
          callSign: typeof invitee.callSign === 'string' ? invitee.callSign : null,
          profileSlug: typeof invitee.profileSlug === 'string' ? invitee.profileSlug : null,
          role: typeof invitee.role === 'string' ? invitee.role : null,
        }
      : null,
    invitedBy: inviter
      ? {
          id: normaliseId(inviter.id),
          callSign: typeof inviter.callSign === 'string' ? inviter.callSign : null,
          profileSlug: typeof inviter.profileSlug === 'string' ? inviter.profileSlug : null,
          role: typeof inviter.role === 'string' ? inviter.role : null,
        }
      : null,
  };

  if (!options.sanitize) {
    return formatted;
  }

  return {
    id: null,
    flightPlanId: null,
    userId: null,
    role: formatted.role,
    status: formatted.status,
    invitedAt: null,
    respondedAt: null,
    user: formatted.user
      ? {
          id: null,
          callSign: formatted.user.callSign,
          profileSlug: formatted.user.profileSlug,
          role: formatted.user.role,
        }
      : null,
    invitedBy: null,
  };
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await authenticateRequest(req);

  const { slug: rawSlug } = await context.params;
  const slug = sanitizeFlightPlanSlug(rawSlug);
  if (!slug) {
    return corsJson(req, { error: 'Invalid flight plan slug.' }, { status: 400 }, METHODS);
  }

  const flightPlanDoc = await resolveFlightPlanBySlug(auth.payload, slug);
  if (!flightPlanDoc) {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  const publicContributions = Boolean((flightPlanDoc as any)?.publicContributions);
  const flightPlanId = normaliseId(flightPlanDoc.id);
  if (flightPlanId == null) {
    return corsJson(req, { error: 'Unable to resolve flight plan identifier.' }, { status: 500 }, METHODS);
  }

  const ownerId = normaliseId((flightPlanDoc as any)?.owner);
  const viewer = auth.user;
  const hasAdminEditOverride = hasAdminEditOverrideForUser({
    userId: viewer?.id ?? null,
    websiteRole: viewer?.role ?? null,
    adminMode: auth.adminMode,
  });
  const viewerMembership =
    viewer && ownerId != null
      ? await loadMembershipWithOwnerFallback({
          payload: auth.payload,
          flightPlanId,
        userId: viewer.id,
        ownerIdHint: ownerId ?? undefined,
      })
      : null;
  const viewerHasCrewAccess =
    hasAdminEditOverride || (viewerMembership ? membershipIsAcceptedCrew(viewerMembership) : false);
  const viewerIsAcceptedPassenger =
    viewerMembership?.status === 'accepted' && viewerMembership?.role === 'guest';
  const viewerIsContributor = publicContributions && Boolean(viewer) && !viewerHasCrewAccess && !viewerIsAcceptedPassenger;
  const viewerCanView = canUserReadFlightPlan({
    user: viewer,
    ownerId,
    membershipRole: viewerMembership?.status === 'accepted' ? viewerMembership?.role : null,
    policy: (flightPlanDoc as any)?.accessPolicy,
    visibility: (flightPlanDoc as any)?.visibility,
    isPublic: (flightPlanDoc as any)?.isPublic,
    publicContributions: (flightPlanDoc as any)?.publicContributions,
    adminMode: auth.adminMode,
  });
  const shouldSanitize = !(viewerHasCrewAccess || viewerIsAcceptedPassenger || viewerIsContributor);

  if (!viewerCanView) {
    return corsJson(
      req,
      { error: 'Crew roster is limited to the captain and confirmed crew.' },
      { status: viewer ? 403 : 401 },
      METHODS,
    );
  }

  try {
    const memberships = await listMembershipsForFlightPlan(auth.payload, flightPlanId);
    if (!memberships.length) {
      return corsJson(req, { memberships: [] }, {}, METHODS);
    }

    const userIds = new Set<number>();
    const inviterIds = new Set<number>();
    memberships.forEach((membership) => {
      userIds.add(membership.userId);
      if (membership.invitedById != null) inviterIds.add(membership.invitedById);
    });

    const [usersResult, invitersResult] = await Promise.all([
      userIds.size
        ? auth.payload.find({
            collection: 'users',
            where: { id: { in: Array.from(userIds) } },
            limit: userIds.size,
            depth: 0,
            overrideAccess: true,
          })
        : Promise.resolve({ docs: [] as any[] }),
      shouldSanitize || inviterIds.size === 0
        ? Promise.resolve({ docs: [] as any[] })
        : auth.payload.find({
            collection: 'users',
            where: { id: { in: Array.from(inviterIds) } },
            limit: inviterIds.size,
            depth: 0,
            overrideAccess: true,
          }),
    ]);

    const userMap = new Map<number, any>();
    usersResult.docs.forEach((doc: any) => {
      const id = normaliseId(doc?.id);
      if (id != null) userMap.set(id, doc);
    });

    const inviterMap = new Map<number, any>();
    invitersResult.docs.forEach((doc: any) => {
      const id = normaliseId(doc?.id);
      if (id != null) inviterMap.set(id, doc);
    });

    return corsJson(
      req,
      {
        memberships: memberships.map((membership) =>
          formatMembership(
            membership,
            userMap.get(membership.userId) ?? null,
            shouldSanitize || membership.invitedById == null ? null : inviterMap.get(membership.invitedById),
            { sanitize: shouldSanitize },
          ),
        ),
      },
      {},
      METHODS,
    );
  } catch (error) {
    auth.payload.logger.error({ err: error, flightPlanId, slug }, 'Failed to list flight plan members');
    return corsJson(
      req,
      { error: 'Unable to load flight plan memberships.' },
      { status: 500 },
      METHODS,
    );
  }
}

type InviteBody = {
  slug?: string;
};

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const { slug: rawSlug } = await context.params;
  const slugParam = sanitizeFlightPlanSlug(rawSlug);
  if (!slugParam) {
    return corsJson(req, { error: 'Invalid flight plan slug.' }, { status: 400 }, METHODS);
  }

  const flightPlanDoc = await resolveFlightPlanBySlug(auth.payload, slugParam);
  if (!flightPlanDoc) {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  const flightPlanId = normaliseId(flightPlanDoc.id);
  if (flightPlanId == null) {
    return corsJson(req, { error: 'Unable to resolve flight plan identifier.' }, { status: 500 }, METHODS);
  }

  const ownerId = normaliseId((flightPlanDoc as any)?.owner);
  const ownerMayInvite = await ownerCanInvite({
    payload: auth.payload,
    flightPlanId,
    userId: auth.user.id,
    ownerIdHint: ownerId ?? undefined,
    websiteRole: auth.user.role,
    adminMode: auth.adminMode,
  });
  if (!ownerMayInvite) {
    return corsJson(
      req,
      { error: 'Only the captain can invite new collaborators unless captain admin edit mode is enabled.' },
      { status: 403 },
      METHODS,
    );
  }

  const body = (await req.json().catch(() => ({}))) as InviteBody;
  const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
  if (!slug) {
    return corsJson(req, { error: 'Crew profile slug is required.' }, { status: 400 }, METHODS);
  }

  try {
    const target = await auth.payload.find({
      collection: 'users',
      where: {
        and: [
          { profileSlug: { equals: slug } },
          { profileSlug: { exists: true } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const userDoc = target.docs[0] as any;
    if (!userDoc) {
      return corsJson(req, { error: 'Crew profile not found.' }, { status: 404 }, METHODS);
    }

    if (!userDoc.profileSlug) {
      return corsJson(
        req,
        { error: 'Crew member must complete their profile before joining a flight plan.' },
        { status: 400 },
        METHODS,
      );
    }

    const record = await inviteMember({
      payload: auth.payload,
      flightPlanId,
      inviterId: auth.user.id,
      targetUser: userDoc,
    });

    if (!record) {
      return corsJson(req, { error: 'Unable to create invite.' }, { status: 500 }, METHODS);
    }

    const inviterSummary = {
      id: normaliseId(auth.user.id),
      callSign: typeof (auth.user as any)?.callSign === 'string' ? (auth.user as any).callSign : null,
      profileSlug:
        typeof (auth.user as any)?.profileSlug === 'string' ? (auth.user as any).profileSlug : null,
      role: typeof (auth.user as any)?.role === 'string' ? (auth.user as any).role : null,
    };

    const inviteeId = normaliseId(userDoc.id);
    if (inviteeId != null) {
      await notifyFlightPlanInvitationReceived({
        payload: auth.payload,
        inviteeId,
        ownerCallsign: typeof (auth.user as any)?.callSign === 'string' ? (auth.user as any).callSign : null,
        planSlug: typeof (flightPlanDoc as any)?.slug === 'string' ? (flightPlanDoc as any).slug : slugParam,
        planTitle: typeof (flightPlanDoc as any)?.title === 'string' ? (flightPlanDoc as any).title : null,
      });
    }

    return corsJson(
      req,
      {
        membership: formatMembership(record, userDoc, inviterSummary),
      },
      { status: 201 },
      METHODS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send invite.';
    auth.payload.logger.warn(
      { err: error, flightPlanId, slug: slugParam },
      'Failed to invite crew member to flight plan',
    );
    return corsJson(req, { error: message }, { status: 400 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
