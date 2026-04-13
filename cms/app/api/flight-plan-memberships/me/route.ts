import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import { loadMembershipsForUser } from '@/app/api/_lib/flightPlanMembers';

const METHODS = 'OPTIONS,GET' as const;

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const userId = auth.user.id;
  if (userId == null) {
    return corsJson(req, { error: 'User profile incomplete.' }, { status: 400 }, METHODS);
  }

  try {
    const memberships = await loadMembershipsForUser({
      payload: auth.payload,
      userId,
      acceptedOnly: true,
      roles: ['owner', 'crew'],
    });

    const flightPlanIds = Array.from(new Set(memberships.map((entry) => entry.flightPlanId)));
    const plans = flightPlanIds.length
      ? await auth.payload.find({
          collection: 'flight-plans',
          where: {
            id: {
              in: flightPlanIds,
            },
          },
          limit: flightPlanIds.length,
          depth: 0,
          overrideAccess: true,
        })
      : { docs: [] };

    const planMap = new Map<number, any>();
    for (const doc of plans.docs as any[]) {
      if (doc?.id != null) {
        planMap.set(Number(doc.id), doc);
      }
    }

    const result = memberships.map((membership) => {
      const plan = planMap.get(membership.flightPlanId);
      return {
        membershipId: membership.id,
        flightPlanId: membership.flightPlanId,
        role: membership.role,
        flightPlan: plan
          ? {
              id: Number(plan.id),
              title: typeof plan.title === 'string' ? plan.title : null,
              slug: typeof plan.slug === 'string' ? plan.slug : null,
              displayDate: typeof plan.displayDate === 'string' ? plan.displayDate : null,
            }
          : null,
      };
    });

    return corsJson(req, { memberships: result }, {}, METHODS);
  } catch (error) {
    auth.payload.logger.error(
      { err: error, userId },
      'Failed to load flight plan memberships for user',
    );
    return corsJson(
      req,
      { error: 'Unable to load crew flight plans.' },
      { status: 500 },
      METHODS,
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
