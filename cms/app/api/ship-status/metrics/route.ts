import type { NextRequest } from 'next/server';
import type { Where } from 'payload';

import type { User } from '@/payload-types';
import { getPayloadInstance } from '@/app/lib/payload';

import { getAuthProtectionTelemetrySnapshot } from '../../_lib/authProtectionTelemetry';
import { getAuthorizationDecisionTelemetrySnapshot } from '../../_lib/authorizationDecisionTelemetry';
import { authenticateRequest } from '../../_lib/auth';
import { corsEmpty, corsJson } from '../../_lib/cors';
import { buildNonTestUserWhere } from '../../_lib/userAudience';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,GET';
const ACCESS_SCOPE_QUERY_PARAM = 'scope';
const INTERNAL_SCOPE = 'internal';
const INTERNAL_ACCESS_ROLES = new Set<User['role']>(['captain', 'quartermaster']);

type AccessClass = 'public' | 'authenticated' | 'internal';
type PayloadWhere = Where;

type MetricsSnapshotBase = {
  ok: true;
  generatedAt: string;
  degraded?: {
    reason: string;
  };
  windows: {
    since24h: { start: string; end: string };
    since7d: { start: string; end: string };
  };
  custom?: {
    window: { start: string; end: string };
    previousWindow: { start: string; end: string };
    counts: {
      users: number;
      logs: number;
      flightPlans: number;
    };
    previousCounts: {
      users: number;
      logs: number;
      flightPlans: number;
    };
    deltas: {
      users: number;
      logs: number;
      flightPlans: number;
    };
    activity: {
      activeUsers: number;
      previousActiveUsers: number;
      delta: number;
    };
  };
  activity: {
    since24h: {
      activeUsers: number;
    };
    since7d: {
      activeUsers: number;
    };
  };
  totals: {
    users: number;
    logs: number;
    flightPlans: number;
  };
  deltas: {
    since24h: {
      users: number;
      logs: number;
      flightPlans: number;
    };
    since7d: {
      users: number;
      logs: number;
      flightPlans: number;
    };
  };
};

type PublicMetricsSnapshot = {
  ok: true;
  accessClass: 'public';
  generatedAt: string;
  degraded?: {
    reason: string;
  };
  windows: {
    since24h: { start: string; end: string };
    since7d: { start: string; end: string };
  };
  contract: {
    customWindowAllowed: false;
    detailedCountersRedacted: true;
  };
};

type DetailedMetricsSnapshot = MetricsSnapshotBase & {
  accessClass: 'authenticated' | 'internal';
  protections?: {
    authRateLimitDegraded: ReturnType<typeof getAuthProtectionTelemetrySnapshot>;
    authorizationDecisions: ReturnType<typeof getAuthorizationDecisionTelemetrySnapshot>;
  };
};

const CACHE_TTL_MS = 30_000;

let cachedDetailed: {
  generatedAtMs: number;
  snapshot: MetricsSnapshotBase;
} | null = null;

let cachedPublic: {
  generatedAtMs: number;
  snapshot: PublicMetricsSnapshot;
} | null = null;

type PayloadInstance = Awaited<ReturnType<typeof getPayloadInstance>>;

const isoFromMs = (ms: number) => new Date(ms).toISOString();
const DAY_MS = 24 * 60 * 60 * 1000;

const parseIsoMs = (value: string | null) => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

const hasAuthHint = (req: NextRequest): boolean =>
  Boolean(req.headers.get('authorization') || req.headers.get('cookie'));

const wantsInternalScope = (req: NextRequest): boolean =>
  req.nextUrl.searchParams.get(ACCESS_SCOPE_QUERY_PARAM) === INTERNAL_SCOPE;

const canAccessInternalScope = (user: User | null): boolean =>
  Boolean(user && INTERNAL_ACCESS_ROLES.has(user.role));

const setAccessClassHeader = <T extends Response>(response: T, accessClass: AccessClass): T => {
  response.headers.set('X-API-Access-Class', accessClass);
  return response;
};

const mergeWhereClauses = (...clauses: Array<PayloadWhere | null | undefined>): PayloadWhere | undefined => {
  const resolved = clauses.filter((clause): clause is PayloadWhere => Boolean(clause));
  if (resolved.length === 0) return undefined;
  if (resolved.length === 1) return resolved[0];
  return { and: resolved };
};

const buildPublicSnapshot = (
  generatedAtMs: number,
  degradedReason?: string,
): PublicMetricsSnapshot => {
  const generatedAt = isoFromMs(generatedAtMs);
  return {
    ok: true,
    accessClass: 'public',
    generatedAt,
    ...(degradedReason ? { degraded: { reason: degradedReason } } : {}),
    windows: {
      since24h: { start: isoFromMs(generatedAtMs - DAY_MS), end: generatedAt },
      since7d: { start: isoFromMs(generatedAtMs - 7 * DAY_MS), end: generatedAt },
    },
    contract: {
      customWindowAllowed: false,
      detailedCountersRedacted: true,
    },
  };
};

const withAccessClass = (
  snapshot: MetricsSnapshotBase,
  accessClass: 'authenticated' | 'internal',
): DetailedMetricsSnapshot => ({
  ...snapshot,
  accessClass,
  ...(accessClass === 'internal'
    ? {
        protections: {
          authRateLimitDegraded: getAuthProtectionTelemetrySnapshot(),
          authorizationDecisions: getAuthorizationDecisionTelemetrySnapshot(),
        },
      }
    : {}),
});

const countSince = async (
  payload: PayloadInstance,
  collection: string,
  startIso: string,
  endIso: string,
  extraWhere?: PayloadWhere,
) => {
  const windowWhere: PayloadWhere = {
    and: [{ createdAt: { greater_than_equal: startIso } }, { createdAt: { less_than: endIso } }],
  };
  const result = await payload.find({
    collection: collection as any,
    where: mergeWhereClauses(windowWhere, extraWhere),
    limit: 0,
    depth: 0,
    overrideAccess: true,
  });
  return result.totalDocs ?? 0;
};

const countTotal = async (
  payload: PayloadInstance,
  collection: string,
  extraWhere?: PayloadWhere,
) => {
  const result = await payload.find({
    collection: collection as any,
    where: extraWhere,
    limit: 0,
    depth: 0,
    overrideAccess: true,
  });
  return result.totalDocs ?? 0;
};

const countActiveSince = async (
  payload: PayloadInstance,
  startIso: string,
  endIso: string,
  extraWhere?: PayloadWhere,
) => {
  const windowWhere: PayloadWhere = {
    and: [
      { lastActiveAt: { greater_than_equal: startIso } },
      { lastActiveAt: { less_than: endIso } },
    ],
  };
  const result = await payload.find({
    collection: 'users' as any,
    where: mergeWhereClauses(windowWhere, extraWhere),
    limit: 0,
    depth: 0,
    overrideAccess: true,
  });
  return result.totalDocs ?? 0;
};

const collectErrorMessages = (error: unknown): string[] => {
  const messages = new Set<string>();
  const queue: unknown[] = [error];
  const seen = new Set<unknown>();

  while (queue.length) {
    const current = queue.shift();
    if (!current || seen.has(current)) continue;
    seen.add(current);

    if (typeof current === 'string') {
      messages.add(current);
      continue;
    }

    if (current instanceof Error) {
      if (current.message) messages.add(current.message);
      queue.push((current as { cause?: unknown }).cause);
      continue;
    }

    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (typeof record.message === 'string') messages.add(record.message);
      if (typeof record.detail === 'string') messages.add(record.detail);
      if (typeof record.hint === 'string') messages.add(record.hint);
      queue.push(record.cause, record.error, record.originalError);
    }
  }

  return Array.from(messages);
};

const isRecoverableActivityError = (error: unknown): boolean => {
  const messages = collectErrorMessages(error).map((message) => message.toLowerCase());
  return messages.some(
    (message) =>
      message.includes('last_active_at') ||
      message.includes('lastactiveat') ||
      (message.includes('path cannot be queried') && message.includes('lastactiveat')),
  );
};

const logMetricFallback = (
  payload: PayloadInstance | null,
  metric: string,
  error: unknown,
  reason: string,
) => {
  payload?.logger?.warn?.(
    { err: error, metric, reason },
    '[ship-status] Falling back to zero for metric query.',
  );
};

const countWithFallback = async (
  payload: PayloadInstance,
  metric: string,
  resolver: () => Promise<number>,
  shouldFallback: (error: unknown) => boolean = () => true,
) => {
  try {
    return await resolver();
  } catch (error) {
    if (!shouldFallback(error)) {
      throw error;
    }
    logMetricFallback(payload, metric, error, 'query failure');
    return 0;
  }
};

const countSinceSafe = async (
  payload: PayloadInstance,
  collection: string,
  startIso: string,
  endIso: string,
  extraWhere?: PayloadWhere,
) =>
  countWithFallback(payload, `${collection}.since`, () =>
    countSince(payload, collection, startIso, endIso, extraWhere),
  );

const countTotalSafe = async (
  payload: PayloadInstance,
  collection: string,
  extraWhere?: PayloadWhere,
) =>
  countWithFallback(payload, `${collection}.total`, () => countTotal(payload, collection, extraWhere));

const countActiveSinceSafe = async (
  payload: PayloadInstance,
  startIso: string,
  endIso: string,
  extraWhere?: PayloadWhere,
) =>
  countWithFallback(
    payload,
    'users.activeSince',
    () => countActiveSince(payload, startIso, endIso, extraWhere),
    isRecoverableActivityError,
  );

const buildZeroSnapshot = (
  generatedAtMs: number,
  customWindow?: { startMs: number; endMs: number },
  degradedReason?: string,
): MetricsSnapshotBase => {
  const generatedAt = isoFromMs(generatedAtMs);
  const since24hStart = isoFromMs(generatedAtMs - DAY_MS);
  const since7dStart = isoFromMs(generatedAtMs - 7 * DAY_MS);
  let custom: MetricsSnapshotBase['custom'];

  if (customWindow) {
    const windowDurationMs = customWindow.endMs - customWindow.startMs;
    const previousStartMs = customWindow.startMs - windowDurationMs;
    const previousEndMs = customWindow.startMs;
    custom = {
      window: { start: isoFromMs(customWindow.startMs), end: isoFromMs(customWindow.endMs) },
      previousWindow: { start: isoFromMs(previousStartMs), end: isoFromMs(previousEndMs) },
      counts: {
        users: 0,
        logs: 0,
        flightPlans: 0,
      },
      previousCounts: {
        users: 0,
        logs: 0,
        flightPlans: 0,
      },
      deltas: {
        users: 0,
        logs: 0,
        flightPlans: 0,
      },
      activity: {
        activeUsers: 0,
        previousActiveUsers: 0,
        delta: 0,
      },
    };
  }

  return {
    ok: true,
    generatedAt,
    ...(degradedReason ? { degraded: { reason: degradedReason } } : {}),
    windows: {
      since24h: { start: since24hStart, end: generatedAt },
      since7d: { start: since7dStart, end: generatedAt },
    },
    ...(custom ? { custom } : {}),
    activity: {
      since24h: { activeUsers: 0 },
      since7d: { activeUsers: 0 },
    },
    totals: {
      users: 0,
      logs: 0,
      flightPlans: 0,
    },
    deltas: {
      since24h: {
        users: 0,
        logs: 0,
        flightPlans: 0,
      },
      since7d: {
        users: 0,
        logs: 0,
        flightPlans: 0,
      },
    },
  };
};

export async function GET(req: NextRequest) {
  const internalScopeRequested = wantsInternalScope(req);
  const startParam = req.nextUrl.searchParams.get('start');
  const endParam = req.nextUrl.searchParams.get('end');
  const customStartMs = parseIsoMs(startParam);
  const customEndMs = parseIsoMs(endParam);
  const hasCustomWindow = Boolean(startParam || endParam);

  let accessClass: AccessClass = 'public';
  let payloadInstance: PayloadInstance | null = null;

  if (internalScopeRequested || hasAuthHint(req)) {
    const auth = await authenticateRequest(req);
    payloadInstance = auth.payload;

    if (auth.user) {
      accessClass = 'authenticated';
      if (internalScopeRequested) {
        if (!canAccessInternalScope(auth.user)) {
          const response = corsJson(
            req,
            { ok: false, error: 'Internal scope is restricted to captain/quartermaster operators.' },
            { status: 403 },
            METHODS,
          );
          return setAccessClassHeader(response, accessClass);
        }
        accessClass = 'internal';
      }
    } else if (internalScopeRequested) {
      const response = corsJson(
        req,
        { ok: false, error: 'Authentication required for internal metrics scope.' },
        { status: 401 },
        METHODS,
      );
      return setAccessClassHeader(response, accessClass);
    }
  }

  if (accessClass === 'public' && hasCustomWindow) {
    const response = corsJson(
      req,
      { ok: false, error: 'Custom window metrics require authenticated access.' },
      { status: 403 },
      METHODS,
    );
    return setAccessClassHeader(response, accessClass);
  }

  if (hasCustomWindow && (!startParam || !endParam)) {
    const response = corsJson(
      req,
      { ok: false, error: 'Both start and end must be provided for a custom window.' },
      { status: 400 },
      METHODS,
    );
    return setAccessClassHeader(response, accessClass);
  }

  if (hasCustomWindow && (customStartMs === null || customEndMs === null)) {
    const response = corsJson(
      req,
      { ok: false, error: 'Invalid start or end timestamp. Use ISO 8601 strings.' },
      { status: 400 },
      METHODS,
    );
    return setAccessClassHeader(response, accessClass);
  }

  if (hasCustomWindow && customStartMs !== null && customEndMs !== null && customStartMs >= customEndMs) {
    const response = corsJson(
      req,
      { ok: false, error: 'Start must be before end for a custom window.' },
      { status: 400 },
      METHODS,
    );
    return setAccessClassHeader(response, accessClass);
  }

  const nowMs = Date.now();

  if (accessClass === 'public') {
    if (!hasCustomWindow && cachedPublic && nowMs - cachedPublic.generatedAtMs < CACHE_TTL_MS) {
      const response = corsJson(req, cachedPublic.snapshot, { status: 200 }, METHODS);
      response.headers.set('Cache-Control', 'public, max-age=30');
      return setAccessClassHeader(response, accessClass);
    }

    const snapshot = buildPublicSnapshot(nowMs);
    if (!hasCustomWindow) {
      cachedPublic = { generatedAtMs: nowMs, snapshot };
    }
    const response = corsJson(req, snapshot, { status: 200 }, METHODS);
    response.headers.set('Cache-Control', 'public, max-age=30');
    return setAccessClassHeader(response, accessClass);
  }

  const detailedAccessClass = accessClass === 'internal' ? 'internal' : 'authenticated';

  if (!hasCustomWindow && cachedDetailed && nowMs - cachedDetailed.generatedAtMs < CACHE_TTL_MS) {
    const response = corsJson(
      req,
      withAccessClass(cachedDetailed.snapshot, detailedAccessClass),
      { status: 200 },
      METHODS,
    );
    response.headers.set('Cache-Control', 'private, no-store');
    return setAccessClassHeader(response, detailedAccessClass);
  }

  try {
    const generatedAtMs = Date.now();
    const generatedAt = isoFromMs(generatedAtMs);
    const since24hStart = isoFromMs(generatedAtMs - DAY_MS);
    const since7dStart = isoFromMs(generatedAtMs - 7 * DAY_MS);
    const nonTestUserWhere = buildNonTestUserWhere();

    const payload = payloadInstance ?? (await getPayloadInstance());
    const [
      users,
      logs,
      flightPlans,
      users24h,
      logs24h,
      flightPlans24h,
      users7d,
      logs7d,
      flightPlans7d,
      activeUsers24h,
      activeUsers7d,
    ] = await Promise.all([
      countTotalSafe(payload, 'users', nonTestUserWhere),
      countTotalSafe(payload, 'logs'),
      countTotalSafe(payload, 'flight-plans'),
      countSinceSafe(payload, 'users', since24hStart, generatedAt, nonTestUserWhere),
      countSinceSafe(payload, 'logs', since24hStart, generatedAt),
      countSinceSafe(payload, 'flight-plans', since24hStart, generatedAt),
      countSinceSafe(payload, 'users', since7dStart, generatedAt, nonTestUserWhere),
      countSinceSafe(payload, 'logs', since7dStart, generatedAt),
      countSinceSafe(payload, 'flight-plans', since7dStart, generatedAt),
      countActiveSinceSafe(payload, since24hStart, generatedAt, nonTestUserWhere),
      countActiveSinceSafe(payload, since7dStart, generatedAt, nonTestUserWhere),
    ]);

    let custom: MetricsSnapshotBase['custom'];
    if (hasCustomWindow && customStartMs !== null && customEndMs !== null) {
      const windowDurationMs = customEndMs - customStartMs;
      const previousStartMs = customStartMs - windowDurationMs;
      const previousEndMs = customStartMs;
      const [
        usersCustom,
        logsCustom,
        flightPlansCustom,
        usersPrev,
        logsPrev,
        flightPlansPrev,
        activeUsersCustom,
        activeUsersPrev,
      ] =
        await Promise.all([
          countSinceSafe(
            payload,
            'users',
            isoFromMs(customStartMs),
            isoFromMs(customEndMs),
            nonTestUserWhere,
          ),
          countSinceSafe(payload, 'logs', isoFromMs(customStartMs), isoFromMs(customEndMs)),
          countSinceSafe(payload, 'flight-plans', isoFromMs(customStartMs), isoFromMs(customEndMs)),
          countSinceSafe(
            payload,
            'users',
            isoFromMs(previousStartMs),
            isoFromMs(previousEndMs),
            nonTestUserWhere,
          ),
          countSinceSafe(payload, 'logs', isoFromMs(previousStartMs), isoFromMs(previousEndMs)),
          countSinceSafe(payload, 'flight-plans', isoFromMs(previousStartMs), isoFromMs(previousEndMs)),
          countActiveSinceSafe(
            payload,
            isoFromMs(customStartMs),
            isoFromMs(customEndMs),
            nonTestUserWhere,
          ),
          countActiveSinceSafe(
            payload,
            isoFromMs(previousStartMs),
            isoFromMs(previousEndMs),
            nonTestUserWhere,
          ),
        ]);

      custom = {
        window: { start: isoFromMs(customStartMs), end: isoFromMs(customEndMs) },
        previousWindow: { start: isoFromMs(previousStartMs), end: isoFromMs(previousEndMs) },
        counts: {
          users: usersCustom,
          logs: logsCustom,
          flightPlans: flightPlansCustom,
        },
        previousCounts: {
          users: usersPrev,
          logs: logsPrev,
          flightPlans: flightPlansPrev,
        },
        deltas: {
          users: usersCustom - usersPrev,
          logs: logsCustom - logsPrev,
          flightPlans: flightPlansCustom - flightPlansPrev,
        },
        activity: {
          activeUsers: activeUsersCustom,
          previousActiveUsers: activeUsersPrev,
          delta: activeUsersCustom - activeUsersPrev,
        },
      };
    }

    const snapshot: MetricsSnapshotBase = {
      ok: true,
      generatedAt,
      windows: {
        since24h: { start: since24hStart, end: generatedAt },
        since7d: { start: since7dStart, end: generatedAt },
      },
      ...(custom ? { custom } : {}),
      activity: {
        since24h: { activeUsers: activeUsers24h },
        since7d: { activeUsers: activeUsers7d },
      },
      totals: {
        users,
        logs,
        flightPlans,
      },
      deltas: {
        since24h: {
          users: users24h,
          logs: logs24h,
          flightPlans: flightPlans24h,
        },
        since7d: {
          users: users7d,
          logs: logs7d,
          flightPlans: flightPlans7d,
        },
      },
    };

    if (!hasCustomWindow) {
      cachedDetailed = { generatedAtMs, snapshot };
    }

    const response = corsJson(
      req,
      withAccessClass(snapshot, detailedAccessClass),
      { status: 200 },
      METHODS,
    );
    response.headers.set('Cache-Control', 'private, no-store');
    return setAccessClassHeader(response, detailedAccessClass);
  } catch (error) {
    console.error('[ship-status] metrics failed', error);
    const fallbackWindow =
      hasCustomWindow && customStartMs !== null && customEndMs !== null
        ? { startMs: customStartMs, endMs: customEndMs }
        : undefined;
    const snapshot = buildZeroSnapshot(Date.now(), fallbackWindow, 'runtime fallback');
    if (!hasCustomWindow) {
      cachedDetailed = { generatedAtMs: Date.now(), snapshot };
    }
    const response = corsJson(
      req,
      withAccessClass(snapshot, detailedAccessClass),
      { status: 200 },
      METHODS,
    );
    response.headers.set('Cache-Control', 'private, no-store');
    return setAccessClassHeader(response, detailedAccessClass);
  }
}

export async function OPTIONS(req: NextRequest) {
  const response = corsEmpty(req, METHODS);
  response.headers.set('X-API-Access-Class', 'public');
  return response;
}
