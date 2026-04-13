import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { authenticateRequestMock } = vi.hoisted(() => ({
  authenticateRequestMock: vi.fn(),
}));

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: authenticateRequestMock,
}));

const makeRequest = (
  query: Record<string, string> = {},
  options: { authorization?: string; cookie?: string } = {},
) => {
  const nextUrl = new URL('https://astral.test/api/ship-status/metrics');
  Object.entries(query).forEach(([key, value]) => {
    nextUrl.searchParams.set(key, value);
  });

  const headers = new Headers();
  if (options.authorization) headers.set('authorization', options.authorization);
  if (options.cookie) headers.set('cookie', options.cookie);

  return {
    headers,
    nextUrl,
  } as unknown as NextRequest;
};

type PayloadMockOptions = {
  failOnActiveQuery?: boolean;
  failOnCollection?: string;
  throwOnFind?: boolean;
};

const buildPayloadMock = (options: PayloadMockOptions = {}) => {
  const totals: Record<string, number> = {
    users: 8,
    logs: 20,
    'flight-plans': 5,
  };

  const find = vi.fn(async ({ collection, where }: { collection: string; where?: unknown }) => {
    if (options.throwOnFind) {
      throw new Error('forced payload failure');
    }

    if (options.failOnCollection && options.failOnCollection === collection) {
      throw new Error(`forced ${collection} failure`);
    }

    const whereText = JSON.stringify(where ?? {});
    if (options.failOnActiveQuery && whereText.includes('lastActiveAt')) {
      throw new Error('column "last_active_at" does not exist');
    }

    if (where) {
      const bounds = extractWindowBounds(where);
      if (bounds) {
        return { totalDocs: 2, docs: [] };
      }

      if (collection === 'users' && hasNonTestUserClause(where)) {
        return { totalDocs: totals.users, docs: [] };
      }

      return { totalDocs: 2, docs: [] };
    }

    return {
      totalDocs: totals[collection] ?? 0,
      docs: [],
    };
  });

  return {
    find,
    logger: {
      warn: vi.fn(),
    },
  };
};

const extractWindowBounds = (where: unknown) => {
  const findRangeValue = (
    node: unknown,
    field: 'createdAt' | 'lastActiveAt',
    operator: 'greater_than_equal' | 'less_than',
  ): string | null => {
    if (!node || typeof node !== 'object') return null;
    const record = node as Record<string, unknown>;
    const direct = (record[field] as Record<string, unknown> | undefined)?.[operator];
    if (typeof direct === 'string' && direct.length > 0) return direct;

    const and = Array.isArray(record.and) ? (record.and as unknown[]) : [];
    for (const child of and) {
      const nested = findRangeValue(child, field, operator);
      if (nested) return nested;
    }
    return null;
  };

  const start =
    findRangeValue(where, 'createdAt', 'greater_than_equal') ??
    findRangeValue(where, 'lastActiveAt', 'greater_than_equal');
  const end =
    findRangeValue(where, 'createdAt', 'less_than') ??
    findRangeValue(where, 'lastActiveAt', 'less_than');

  return start && end ? { start, end } : null;
};

const hasFieldExclusionClause = (
  where: unknown,
  field: 'isTestUser' | 'accountType',
  notEqualsValue: boolean | string,
): boolean => {
  if (!where || typeof where !== 'object') return false;
  const record = where as Record<string, unknown>;

  if (Array.isArray(record.or)) {
    const clauses = record.or as Array<Record<string, unknown>>;
    const hasNotEquals = clauses.some(
      (entry) =>
        (entry[field] as { not_equals?: boolean | string } | undefined)?.not_equals ===
        notEqualsValue,
    );
    const hasExistsFalse = clauses.some(
      (entry) => (entry[field] as { exists?: boolean } | undefined)?.exists === false,
    );
    return hasNotEquals && hasExistsFalse;
  }

  if (Array.isArray(record.and)) {
    return (record.and as unknown[]).some((entry) =>
      hasFieldExclusionClause(entry, field, notEqualsValue),
    );
  }

  return false;
};

const hasNonTestUserClause = (where: unknown): boolean =>
  hasFieldExclusionClause(where, 'isTestUser', true) &&
  hasFieldExclusionClause(where, 'accountType', 'test');

const buildCustomWindowPayloadMock = () => {
  const totals: Record<string, number> = {
    users: 34,
    logs: 44,
    'flight-plans': 12,
  };

  const windowCounts = new Map<string, number>([
    ['users|2026-03-23T00:00:00.000Z|2026-03-30T00:00:00.000Z', 7],
    ['logs|2026-03-23T00:00:00.000Z|2026-03-30T00:00:00.000Z', 11],
    ['flight-plans|2026-03-23T00:00:00.000Z|2026-03-30T00:00:00.000Z', 5],
    ['users|2026-03-16T00:00:00.000Z|2026-03-23T00:00:00.000Z', 3],
    ['logs|2026-03-16T00:00:00.000Z|2026-03-23T00:00:00.000Z', 6],
    ['flight-plans|2026-03-16T00:00:00.000Z|2026-03-23T00:00:00.000Z', 2],
    ['active|2026-03-23T00:00:00.000Z|2026-03-30T00:00:00.000Z', 4],
    ['active|2026-03-16T00:00:00.000Z|2026-03-23T00:00:00.000Z', 1],
  ]);

  const find = vi.fn(
    async ({ collection, where }: { collection: string; where?: Record<string, unknown> }) => {
      if (!where) {
        return {
          totalDocs: totals[collection] ?? 0,
          docs: [],
        };
      }

      const bounds = extractWindowBounds(where);
      if (!bounds) {
        if (collection === 'users' && hasNonTestUserClause(where)) {
          return { totalDocs: totals.users, docs: [] };
        }
        return { totalDocs: 0, docs: [] };
      }

      const whereText = JSON.stringify(where);
      const keyPrefix = whereText.includes('lastActiveAt') ? 'active' : collection;
      const key = `${keyPrefix}|${bounds.start}|${bounds.end}`;
      return { totalDocs: windowCounts.get(key) ?? 0, docs: [] };
    },
  );

  return {
    find,
    logger: {
      warn: vi.fn(),
    },
  };
};

const expectUserQueriesToExcludeTestUsers = (payload: { find: ReturnType<typeof vi.fn> }) => {
  const userQueries = payload.find.mock.calls
    .map((call) => call[0] as { collection?: string; where?: unknown })
    .filter((query) => query.collection === 'users');

  expect(userQueries.length).toBeGreaterThan(0);
  userQueries.forEach((query) => {
    expect(hasNonTestUserClause(query.where)).toBe(true);
  });
};

const mockAuthenticated = (payload: ReturnType<typeof buildPayloadMock>, role: string = 'captain') => {
  authenticateRequestMock.mockResolvedValue({
    payload,
    user: {
      id: 7,
      role,
    },
  });
};

describe('GET /api/ship-status/metrics', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns a public redacted snapshot by default', async () => {
    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Access-Class')).toBe('public');
    expect(body.accessClass).toBe('public');
    expect(body.contract).toEqual({
      customWindowAllowed: false,
      detailedCountersRedacted: true,
    });
    expect(body.totals).toBeUndefined();
    expect(body.activity).toBeUndefined();
  }, 15000);

  it('rejects custom windows for public scope', async () => {
    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(
      makeRequest({
        start: '2026-03-23T00:00:00.000Z',
        end: '2026-03-30T00:00:00.000Z',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/require authenticated access/i);
  });

  it('requires authentication for internal scope', async () => {
    const payload = buildPayloadMock();
    authenticateRequestMock.mockResolvedValue({
      payload,
      user: null,
    });

    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(
      makeRequest({
        scope: 'internal',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/authentication required/i);
  });

  it('rejects internal scope for non-privileged users', async () => {
    const payload = buildPayloadMock();
    mockAuthenticated(payload, 'crew');

    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(
      makeRequest(
        {
          scope: 'internal',
        },
        {
          authorization: 'Bearer token',
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/restricted/i);
    expect(response.headers.get('X-API-Access-Class')).toBe('authenticated');
  });

  it('returns detailed aggregates for authenticated scope', async () => {
    const payload = buildPayloadMock();
    mockAuthenticated(payload);

    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(makeRequest({}, { authorization: 'Bearer token' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Access-Class')).toBe('authenticated');
    expect(body.accessClass).toBe('authenticated');
    expect(body.totals).toEqual({
      users: 8,
      logs: 20,
      flightPlans: 5,
    });
    expect(body.activity.since24h.activeUsers).toBeTypeOf('number');
    expectUserQueriesToExcludeTestUsers(payload);
  });

  it('returns internal scope telemetry counters for privileged users', async () => {
    const payload = buildPayloadMock();
    mockAuthenticated(payload, 'captain');

    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(
      makeRequest(
        {
          scope: 'internal',
        },
        { authorization: 'Bearer token' },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Access-Class')).toBe('internal');
    expect(body.accessClass).toBe('internal');
    expect(body.protections?.authRateLimitDegraded).toMatchObject({
      observedEvents: expect.any(Number),
    });
    expect(Array.isArray(body.protections?.authRateLimitDegraded?.counters)).toBe(true);
    expect(body.protections?.authorizationDecisions).toMatchObject({
      observedEvents: expect.any(Number),
      allowEvents: expect.any(Number),
      denyEvents: expect.any(Number),
      elevatedAllowEvents: expect.any(Number),
      elevatedReadAllowEvents: expect.any(Number),
      elevatedEditAllowEvents: expect.any(Number),
      adminCapabilityDenyEvents: expect.any(Number),
      alertThresholds: {
        elevatedReadAllowEvents: expect.any(Number),
        elevatedEditAllowEvents: expect.any(Number),
        adminCapabilityDenyEvents: expect.any(Number),
      },
    });
    expect(Array.isArray(body.protections?.authorizationDecisions?.counters)).toBe(true);
    expect(Array.isArray(body.protections?.authorizationDecisions?.alerts)).toBe(true);
  });

  it('exposes authorization decision counters in internal scope', async () => {
    const payload = buildPayloadMock();
    mockAuthenticated(payload, 'captain');

    const telemetry = await import('@/app/api/_lib/authorizationDecisionTelemetry');
    telemetry.resetAuthorizationDecisionTelemetry();
    telemetry.recordAuthorizationDecision({
      payload: null,
      capability: 'adminReadAllContent',
      allowed: false,
      reasonCode: 'deny_ineligible_role',
      actorId: 42,
      actorRole: 'crew',
      resourceType: 'request',
      resourceSlug: '/api/flight-plans/example',
    });

    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(
      makeRequest(
        {
          scope: 'internal',
        },
        { authorization: 'Bearer token' },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.protections?.authorizationDecisions).toMatchObject({
      observedEvents: 1,
      allowEvents: 0,
      denyEvents: 1,
      elevatedAllowEvents: 0,
      elevatedReadAllowEvents: 0,
      elevatedEditAllowEvents: 0,
      adminCapabilityDenyEvents: 1,
      alertThresholds: {
        elevatedReadAllowEvents: expect.any(Number),
        elevatedEditAllowEvents: expect.any(Number),
        adminCapabilityDenyEvents: expect.any(Number),
      },
    });
    expect(Array.isArray(body.protections?.authorizationDecisions?.alerts)).toBe(true);
    expect(body.protections?.authorizationDecisions?.counters).toEqual(
      expect.arrayContaining([
        { key: 'adminReadAllContent:deny:deny_ineligible_role', value: 1 },
      ]),
    );
  });

  it('falls back to zero active-user counts when lastActiveAt is unavailable', async () => {
    const payload = buildPayloadMock({ failOnActiveQuery: true });
    mockAuthenticated(payload);

    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(makeRequest({}, { authorization: 'Bearer token' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.activity.since24h.activeUsers).toBe(0);
    expect(body.activity.since7d.activeUsers).toBe(0);
    expect(payload.logger.warn).toHaveBeenCalled();
  });

  it('falls back to zero for non-activity collection failures', async () => {
    const payload = buildPayloadMock({ failOnCollection: 'logs' });
    mockAuthenticated(payload);

    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(makeRequest({}, { authorization: 'Bearer token' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.totals.logs).toBe(0);
    expect(body.deltas.since24h.logs).toBe(0);
    expect(body.deltas.since7d.logs).toBe(0);
    expect(payload.logger.warn).toHaveBeenCalled();
  });

  it('returns a degraded zero snapshot when authenticated payload queries fail', async () => {
    const payload = buildPayloadMock({ throwOnFind: true });
    mockAuthenticated(payload);

    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(makeRequest({}, { authorization: 'Bearer token' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.degraded?.reason).toMatch(/runtime fallback/i);
    expect(body.totals.users).toBe(0);
    expect(body.totals.logs).toBe(0);
    expect(body.totals.flightPlans).toBe(0);
  });

  it('rejects custom windows missing one bound for authenticated scope', async () => {
    const payload = buildPayloadMock();
    mockAuthenticated(payload);

    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(
      makeRequest(
        { start: '2026-03-23T00:00:00.000Z' },
        { authorization: 'Bearer token' },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/both start and end/i);
  });

  it('returns custom and previous window counts with week-over-week deltas for authenticated scope', async () => {
    const payload = buildCustomWindowPayloadMock();
    mockAuthenticated(payload as ReturnType<typeof buildPayloadMock>);

    const { GET } = await import('@/app/api/ship-status/metrics/route');
    const response = await GET(
      makeRequest(
        {
          start: '2026-03-23T00:00:00.000Z',
          end: '2026-03-30T00:00:00.000Z',
        },
        { authorization: 'Bearer token' },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.custom.window).toEqual({
      start: '2026-03-23T00:00:00.000Z',
      end: '2026-03-30T00:00:00.000Z',
    });
    expect(body.custom.previousWindow).toEqual({
      start: '2026-03-16T00:00:00.000Z',
      end: '2026-03-23T00:00:00.000Z',
    });
    expect(body.custom.counts).toEqual({
      users: 7,
      logs: 11,
      flightPlans: 5,
    });
    expect(body.custom.previousCounts).toEqual({
      users: 3,
      logs: 6,
      flightPlans: 2,
    });
    expect(body.custom.deltas).toEqual({
      users: 4,
      logs: 5,
      flightPlans: 3,
    });
    expect(body.custom.activity).toEqual({
      activeUsers: 4,
      previousActiveUsers: 1,
      delta: 3,
    });
    expectUserQueriesToExcludeTestUsers(payload as unknown as { find: ReturnType<typeof vi.fn> });
  });
});
