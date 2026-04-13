import type { NextRequest } from 'next/server';

import { authenticateRequest, buildRequestForUser } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  hasAdminEditOverrideForUser,
  loadMembershipsForUser,
  normaliseId,
} from '@/app/api/_lib/flightPlanMembers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,GET,PUT';
const COLLECTION = 'matrix-flight-plan-mutes';

type MuteDoc = {
  id?: unknown;
  flightPlan?: unknown;
  muted?: unknown;
  mutedAt?: unknown;
};

const resolveMuted = (value: unknown): boolean => (typeof value === 'boolean' ? value : true);

const resolveFlightPlanId = (value: unknown): number | null => normaliseId(value);

const resolveMuteDoc = (doc: MuteDoc) => ({
  id: normaliseId(doc.id),
  flightPlanId: normaliseId(doc.flightPlan),
  muted: typeof doc.muted === 'boolean' ? doc.muted : true,
  mutedAt: typeof doc.mutedAt === 'string' ? doc.mutedAt : null,
});

const buildRecordKey = (userId: number, flightPlanId: number) => `${userId}:${flightPlanId}`;

const buildMuteWhere = (userId: number, flightPlanId: number) => ({
  user: {
    equals: userId,
  },
  flightPlan: {
    equals: flightPlanId,
  },
});

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}

export async function GET(req: NextRequest) {
  const { payload, user } = await authenticateRequest(req);
  if (!user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  try {
    const result = await payload.find({
      collection: COLLECTION,
      where: {
        user: {
          equals: user.id,
        },
        muted: {
          equals: true,
        },
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });

    const mutes = result.docs.map((doc) => resolveMuteDoc(doc as MuteDoc));
    return corsJson(req, { mutes }, {}, METHODS);
  } catch (error) {
    payload.logger?.error?.({ err: error, userId: user.id }, '[matrix-mutes] failed to load');
    return corsJson(req, { error: 'Unable to load mute preferences.' }, { status: 500 }, METHODS);
  }
}

export async function PUT(req: NextRequest) {
  const { payload, user, adminMode } = await authenticateRequest(req);
  if (!user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const flightPlanId = resolveFlightPlanId(body.flightPlanId);
  if (!flightPlanId) {
    return corsJson(req, { error: 'Missing flightPlanId.' }, { status: 400 }, METHODS);
  }

  const muted = resolveMuted(body.muted);

  try {
    const hasAdminEditOverride = hasAdminEditOverrideForUser({
      userId: user.id,
      websiteRole: user.role,
      adminMode,
    });
    const memberships = await loadMembershipsForUser({
      payload,
      userId: user.id,
      acceptedOnly: true,
    });
    const hasAccess =
      hasAdminEditOverride ||
      memberships.some((membership) => membership.flightPlanId === flightPlanId);

    if (!hasAccess) {
      return corsJson(req, { error: 'Not a member of this flight plan.' }, { status: 403 }, METHODS);
    }

    const existing = await payload.find({
      collection: COLLECTION,
      where: buildMuteWhere(user.id, flightPlanId),
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const localReq = await buildRequestForUser(payload, user);
    const now = new Date().toISOString();

    if (!muted) {
      const doc = existing.docs[0] as MuteDoc | undefined;
      if (doc?.id != null) {
        await payload.delete({
          collection: COLLECTION,
          id: doc.id as any,
          overrideAccess: true,
          req: localReq,
        });
      }
      return corsJson(req, { flightPlanId, muted: false }, {}, METHODS);
    }

    const doc = existing.docs[0] as MuteDoc | undefined;
    if (doc?.id != null) {
      const updated = await payload.update({
        collection: COLLECTION,
        id: doc.id as any,
        data: {
          muted: true,
          mutedAt: now,
        },
        overrideAccess: true,
        req: localReq,
      });
      return corsJson(req, resolveMuteDoc(updated as MuteDoc), {}, METHODS);
    }

    const created = await payload.create({
      collection: COLLECTION,
      data: {
        recordKey: buildRecordKey(user.id, flightPlanId),
        user: user.id,
        flightPlan: flightPlanId,
        muted: true,
        mutedAt: now,
      },
      overrideAccess: true,
      req: localReq,
    });

    return corsJson(req, resolveMuteDoc(created as MuteDoc), {}, METHODS);
  } catch (error) {
    payload.logger?.error?.(
      { err: error, userId: user.id, flightPlanId, muted },
      '[matrix-mutes] failed to update',
    );
    return corsJson(req, { error: 'Unable to update mute preference.' }, { status: 500 }, METHODS);
  }
}
