import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import type { FlightPlan } from '@/payload-types';
import type { FlightPlanMembershipRecord } from '@/app/api/_lib/flightPlanMembers';

const METHODS = 'OPTIONS,GET' as const;

type IdLike = string | number | null | undefined;

const normaliseId = (value: IdLike): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normaliseId((value as { id?: IdLike }).id);
  }
  return null;
};

const formatFlightPlan = (plan: FlightPlan | null | undefined) => {
  if (!plan) return null;
  return {
    id: normaliseId(plan.id),
    title: typeof plan.title === 'string' ? plan.title : null,
    slug: typeof plan.slug === 'string' ? plan.slug : null,
    path: typeof plan.path === 'string' ? plan.path : null,
    location: typeof plan.location === 'string' ? plan.location : null,
    displayDate: typeof plan.displayDate === 'string' ? plan.displayDate : null,
  };
};

const summariseUser = (raw: any) => {
  if (!raw) return null;
  return {
    id: normaliseId(raw.id),
    callSign: typeof raw.callSign === 'string' ? raw.callSign : null,
    profileSlug: typeof raw.profileSlug === 'string' ? raw.profileSlug : null,
    role: typeof raw.role === 'string' ? raw.role : null,
  };
};

const formatMembership = (
  membership: FlightPlanMembershipRecord,
  plan: FlightPlan | null,
  inviter: any,
) => ({
  membershipId: membership.id,
  flightPlanId: membership.flightPlanId,
  status: membership.status,
  role: membership.role,
  invitedAt: membership.invitedAt,
  respondedAt: membership.respondedAt,
  flightPlan: formatFlightPlan(plan),
  invitedBy: summariseUser(inviter),
});

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const userId = normaliseId(auth.user.id);
  if (userId == null) {
    return corsJson(req, { error: 'User profile incomplete.' }, { status: 400 }, METHODS);
  }

  const parseMembershipDoc = (doc: any): FlightPlanMembershipRecord | null => {
    const id = normaliseId(doc?.id);
    const flightPlanId = normaliseId(doc?.flightPlan);
    const memberId = normaliseId(doc?.user);
    if (id == null || flightPlanId == null || memberId == null) return null;
    const role = typeof doc?.role === 'string' ? (doc.role as any) : 'participant';
    const status =
      typeof doc?.invitationStatus === 'string' ? (doc.invitationStatus as any) : 'pending';
    const invitedById = normaliseId(doc?.invitedBy);
    const invitedAt =
      typeof doc?.invitedAt === 'string' && doc.invitedAt.length > 0 ? doc.invitedAt : null;
    const respondedAt =
      typeof doc?.respondedAt === 'string' && doc.respondedAt.length > 0 ? doc.respondedAt : null;
    return {
      id,
      flightPlanId,
      userId: memberId,
      role,
      status,
      invitedById,
      invitedAt,
      respondedAt,
    };
  };

  try {
    const membershipResult = await auth.payload.find({
      collection: 'flight-plan-memberships',
      where: {
        and: [
          {
            user: {
              equals: userId,
            },
          },
          {
            invitationStatus: {
              in: ['pending'],
            },
          },
        ],
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });

    const memberships: FlightPlanMembershipRecord[] = [];
    const planIds = new Set<number>();
    const inviterIds = new Set<number>();

    for (const doc of membershipResult.docs) {
      const record = parseMembershipDoc(doc);
      if (!record) continue;
      memberships.push(record);
      planIds.add(record.flightPlanId);
      if (record.invitedById != null) inviterIds.add(record.invitedById);
    }

    if (!memberships.length) {
      return corsJson(req, { invites: [] }, {}, METHODS);
    }

    const [plansResult, invitersResult] = await Promise.all([
      planIds.size
        ? auth.payload.find({
            collection: 'flight-plans',
            where: {
              id: { in: Array.from(planIds) },
            },
            limit: planIds.size,
            depth: 0,
            overrideAccess: true,
          })
        : Promise.resolve({ docs: [] as FlightPlan[] }),
      inviterIds.size
        ? auth.payload.find({
            collection: 'users',
            where: {
              id: { in: Array.from(inviterIds) },
            },
            limit: inviterIds.size,
            depth: 0,
            overrideAccess: true,
          })
        : Promise.resolve({ docs: [] as any[] }),
    ]);

    const planMap = new Map<number, FlightPlan>();
    for (const doc of plansResult.docs as unknown as FlightPlan[]) {
      const planId = normaliseId(doc.id);
      if (planId != null) {
        planMap.set(planId, doc);
      }
    }

    const inviterMap = new Map<number, any>();
    for (const doc of invitersResult.docs as any[]) {
      const inviterId = normaliseId(doc?.id);
      if (inviterId != null) inviterMap.set(inviterId, doc);
    }

    const invites = memberships.map((membership) =>
      formatMembership(
        membership,
        planMap.get(membership.flightPlanId) ?? null,
        membership.invitedById != null ? inviterMap.get(membership.invitedById) : null,
      ),
    );

    return corsJson(req, { invites }, {}, METHODS);
  } catch (error) {
    auth.payload.logger.error({ err: error, userId }, 'Failed to load flight-plan invites');
    return corsJson(
      req,
      { error: 'Unable to load flight plan invitations.' },
      { status: 500 },
      METHODS,
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
