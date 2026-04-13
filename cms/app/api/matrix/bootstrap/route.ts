import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,GET';
const MUTE_COLLECTION = 'matrix-flight-plan-mutes';

type MuteDoc = {
  id?: unknown;
  flightPlan?: unknown;
  muted?: unknown;
  mutedAt?: unknown;
};

type BootstrapMute = {
  flightPlanId: number;
  muted: boolean;
  mutedAt: string | null;
};

const normaliseId = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normaliseId((value as Record<string, unknown>).id);
  }
  return null;
};

const normaliseMuteDoc = (doc: MuteDoc): BootstrapMute | null => {
  const flightPlanId = normaliseId(doc.flightPlan);
  if (flightPlanId == null) return null;
  return {
    flightPlanId,
    muted: doc.muted !== false,
    mutedAt: typeof doc.mutedAt === 'string' ? doc.mutedAt : null,
  };
};

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
      collection: MUTE_COLLECTION,
      where: {
        user: {
          equals: user.id,
        },
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });

    const mutes = result.docs
      .map((doc) => normaliseMuteDoc(doc as MuteDoc))
      .filter((entry): entry is BootstrapMute => Boolean(entry && entry.muted));

    return corsJson(
      req,
      {
        mxid: null,
        accessToken: null,
        rooms: [],
        mutes,
      },
      {},
      METHODS,
    );
  } catch (error) {
    payload.logger?.error?.({ err: error, userId: user.id }, '[matrix-bootstrap] failed');
    return corsJson(req, { error: 'Unable to load Matrix bootstrap data.' }, { status: 500 }, METHODS);
  }
}
