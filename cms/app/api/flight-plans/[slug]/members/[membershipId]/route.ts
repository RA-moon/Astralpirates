import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsJson, corsEmpty } from '@/app/api/_lib/cors';
import {
  loadMembershipWithOwnerFallback,
  loadMembershipById,
  normaliseId,
  resolveFlightPlanBySlug,
  sanitizeFlightPlanSlug,
  updateMembershipRole,
  type FlightPlanMembershipRecord,
} from '@/app/api/_lib/flightPlanMembers';
import { notifyFlightPlanPromotion } from '@/src/services/notifications/flightPlans';

const METHODS = 'OPTIONS,PATCH' as const;

type RoleUpdateBody = {
  action?: string;
  role?: string;
};

const ensurePromotable = (membership: FlightPlanMembershipRecord): void => {
  if (membership.role === 'owner') {
    throw new Error('Captains cannot be reassigned.');
  }
  if (membership.role === 'crew') {
    throw new Error('Crew member already promoted.');
  }
  if (membership.status !== 'accepted') {
    throw new Error('Await acceptance before promotion.');
  }
};

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug: string; membershipId: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const params = await context.params;
  const slug = sanitizeFlightPlanSlug(params.slug);
  if (!slug) {
    return corsJson(req, { error: 'Invalid flight plan slug.' }, { status: 400 }, METHODS);
  }

  const flightPlanDoc = await resolveFlightPlanBySlug(auth.payload, slug);
  if (!flightPlanDoc) {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  const flightPlanId = normaliseId(flightPlanDoc?.id as number | string | null | undefined);
  const membershipId = normaliseId(params.membershipId);
  if (flightPlanId == null) {
    return corsJson(
      req,
      { error: 'Unable to resolve flight plan identifier.' },
      { status: 500 },
      METHODS,
    );
  }

  if (membershipId == null) {
    return corsJson(req, { error: 'Invalid identifiers.' }, { status: 400 }, METHODS);
  }

  const ownerId = normaliseId((flightPlanDoc as any)?.owner);
  const crewCanPromotePassengers = Boolean((flightPlanDoc as any)?.crewCanPromotePassengers);
  const actorMembership = await loadMembershipWithOwnerFallback({
    payload: auth.payload,
    flightPlanId,
    userId: auth.user.id,
    ownerIdHint: ownerId ?? undefined,
  });
  const actorIsOwner = actorMembership?.role === 'owner' && actorMembership.status === 'accepted';
  const actorIsCrew =
    actorMembership?.role === 'crew' && actorMembership.status === 'accepted';
  if (!actorMembership || (!actorIsOwner && !(crewCanPromotePassengers && actorIsCrew))) {
    return corsJson(
      req,
      { error: 'Only the captain (or crew organisers with permission) can manage crew roles.' },
      { status: 403 },
      METHODS,
    );
  }

  const targetMembership = await loadMembershipById(auth.payload, membershipId);
  if (!targetMembership || targetMembership.flightPlanId !== flightPlanId) {
    return corsJson(req, { error: 'Membership not found.' }, { status: 404 }, METHODS);
  }

  const body = (await req.json().catch(() => ({}))) as RoleUpdateBody;
  const action = typeof body.action === 'string' ? body.action.toLowerCase() : '';
  const requestedRole = typeof body.role === 'string' ? body.role.toLowerCase() : 'crew';

  if (action && action !== 'promote') {
    return corsJson(req, { error: 'Unsupported action.' }, { status: 400 }, METHODS);
  }

  if (requestedRole !== 'crew') {
    return corsJson(req, { error: 'Only promotion to crew is supported.' }, { status: 400 }, METHODS);
  }

  try {
    ensurePromotable(targetMembership);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to promote membership.';
    return corsJson(req, { error: message }, { status: 400 }, METHODS);
  }

  try {
    const updated = await updateMembershipRole({
      payload: auth.payload,
      membership: targetMembership,
      nextRole: 'crew',
    });

    await notifyFlightPlanPromotion({
      payload: auth.payload,
      memberId: updated.userId,
      planSlug: typeof (flightPlanDoc as any)?.slug === 'string' ? (flightPlanDoc as any).slug : slug,
      planTitle: typeof (flightPlanDoc as any)?.title === 'string' ? (flightPlanDoc as any).title : null,
    });

    return corsJson(
      req,
      {
        membership: updated,
      },
      {},
      METHODS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to promote membership.';
    auth.payload.logger.warn(
      { err: error, membershipId, flightPlanId, slug },
      'Failed to promote flight plan member',
    );
    return corsJson(req, { error: message }, { status: 400 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
