import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  loadFlightPlanSummary,
  loadMembershipById,
  respondToInvite,
  type FlightPlanMembershipRecord,
} from '@/app/api/_lib/flightPlanMembers';
import { notifyFlightPlanInvitationAccepted } from '@/src/services/notifications/flightPlans';

const METHODS = 'OPTIONS,PATCH' as const;

type ActionBody = {
  action?: string;
};

type RouteParams = { params: Promise<{ membershipId: string }> };

export async function PATCH(req: NextRequest, context: RouteParams) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }
  const { membershipId } = await context.params;

  const body = (await req.json().catch(() => ({}))) as ActionBody;
  const action = typeof body.action === 'string' ? body.action.toLowerCase() : '';
  if (action !== 'accept' && action !== 'decline') {
    return corsJson(
      req,
      { error: 'Action must be either "accept" or "decline".' },
      { status: 400 },
      METHODS,
    );
  }

  const membership: FlightPlanMembershipRecord | null = await loadMembershipById(
    auth.payload,
    membershipId,
  );
  if (!membership) {
    return corsJson(req, { error: 'Invitation not found.' }, { status: 404 }, METHODS);
  }

  if (membership.status !== 'pending') {
    return corsJson(
      req,
      { error: 'Invitation already resolved.' },
      { status: 400 },
      METHODS,
    );
  }

  const planSummary = await loadFlightPlanSummary(auth.payload, membership.flightPlanId);

  try {
    const updated = await respondToInvite({
      payload: auth.payload,
      membership,
      accept: action === 'accept',
      actorId: auth.user.id,
    });

    if (updated && updated.status === 'accepted' && updated.invitedById != null) {
      await notifyFlightPlanInvitationAccepted({
        payload: auth.payload,
        ownerId: updated.invitedById,
        crewCallsign:
          typeof (auth.user as any)?.callSign === 'string' ? (auth.user as any).callSign : null,
        planSlug: planSummary?.slug ?? null,
        planTitle: planSummary?.title ?? null,
      });
    }

    return corsJson(
      req,
      {
        membership: updated,
      },
      {},
      METHODS,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update invitation.';
    auth.payload.logger.warn(
      { err: error, membershipId: membership.id, userId: auth.user.id },
      'Failed to respond to flight plan invite',
    );
    return corsJson(req, { error: message }, { status: 400 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
