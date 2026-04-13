import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  hasAdminEditOverrideForUser,
  loadMembershipsForUser,
  normaliseId,
} from '@/app/api/_lib/flightPlanMembers';

const METHODS = 'OPTIONS,GET' as const;

type FlightPlanOptionSummary = {
  id: number;
  title: string | null;
  slug: string | null;
  displayDate: string | null;
};

type CrewFlightPlanOption = {
  membershipId: number;
  flightPlanId: number;
  role: string;
  flightPlan: FlightPlanOptionSummary | null;
};

const toFlightPlanSummary = (plan: any) => {
  const id = normaliseId(plan?.id);
  if (id == null) return null;
  return {
    id,
    title: typeof plan?.title === 'string' ? plan.title : null,
    slug: typeof plan?.slug === 'string' ? plan.slug : null,
    displayDate: typeof plan?.displayDate === 'string' ? plan.displayDate : null,
  };
};

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
    const hasAdminEditOverride = hasAdminEditOverrideForUser({
      userId: auth.user.id,
      websiteRole: auth.user.role,
      adminMode: auth.adminMode,
    });
    const memberships = await loadMembershipsForUser({
      payload: auth.payload,
      userId,
      acceptedOnly: true,
      roles: ['owner', 'crew'],
    });

    const result: CrewFlightPlanOption[] = memberships.map((membership) => ({
      membershipId: membership.id,
      flightPlanId: membership.flightPlanId,
      role: membership.role,
      flightPlan: null,
    }));
    const resultByPlanId = new Map<number, (typeof result)[number]>();
    result.forEach((entry) => {
      resultByPlanId.set(entry.flightPlanId, entry);
    });

    if (hasAdminEditOverride) {
      const plans = await auth.payload.find({
        collection: 'flight-plans',
        pagination: false,
        depth: 0,
        overrideAccess: true,
      });
      for (const doc of plans.docs as any[]) {
        const summary = toFlightPlanSummary(doc);
        if (!summary) continue;
        const existing = resultByPlanId.get(summary.id);
        if (existing) {
          existing.flightPlan = summary;
          continue;
        }
        result.push({
          membershipId: -summary.id,
          flightPlanId: summary.id,
          role: 'admin-edit-override',
          flightPlan: summary,
        });
      }
    } else {
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
      for (const doc of plans.docs as any[]) {
        const summary = toFlightPlanSummary(doc);
        if (!summary) continue;
        const existing = resultByPlanId.get(summary.id);
        if (existing) {
          existing.flightPlan = summary;
        }
      }
    }

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
