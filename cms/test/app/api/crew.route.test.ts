import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  authenticateRequestMock,
  sanitizePublicProfileMock,
  resolveHonorBadgeMediaByCodeMock,
} = vi.hoisted(() => ({
  authenticateRequestMock: vi.fn(),
  sanitizePublicProfileMock: vi.fn(),
  resolveHonorBadgeMediaByCodeMock: vi.fn(async () => new Map()),
}));

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: authenticateRequestMock,
}));

vi.mock('@/app/api/profiles/_lib/sanitize', () => ({
  sanitizePublicProfile: sanitizePublicProfileMock,
  resolveHonorBadgeMediaByCode: resolveHonorBadgeMediaByCodeMock,
}));

const makeRequest = (query = '') =>
  ({
    headers: new Headers(),
    nextUrl: new URL(`https://astral.test/api/crew${query}`),
  }) as unknown as NextRequest;

const createPayload = () => ({
  find: vi.fn(),
  logger: {
    error: vi.fn(),
  },
});

const createUser = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  role: 'crew',
  profileSlug: 'nova',
  callSign: 'Nova',
  pronouns: 'she/her',
  lastActiveAt: '2026-04-08T10:00:00.000Z',
  currentRoute: '/bridge',
  ...overrides,
});

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

const extractSearchFilters = (where: unknown): Array<Record<string, unknown>> => {
  if (!where || typeof where !== 'object') return [];
  const record = where as Record<string, unknown>;

  if (Array.isArray(record.or)) {
    return record.or as Array<Record<string, unknown>>;
  }

  if (Array.isArray(record.and)) {
    const nested = (record.and as unknown[]).find((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      const or = (entry as Record<string, unknown>).or;
      if (!Array.isArray(or)) return false;
      return !(or as Array<Record<string, unknown>>).some((clause) =>
        Object.prototype.hasOwnProperty.call(clause, 'isTestUser'),
      );
    }) as Record<string, unknown> | undefined;
    if (Array.isArray(nested?.or)) return nested.or as Array<Record<string, unknown>>;

    const fallback = (record.and as unknown[]).find((entry) => {
      if (!entry || typeof entry !== 'object') return false;
      return Array.isArray((entry as Record<string, unknown>).or);
    }) as Record<string, unknown> | undefined;
    return Array.isArray(fallback?.or) ? (fallback.or as Array<Record<string, unknown>>) : [];
  }

  return [];
};

describe('GET /api/crew', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    sanitizePublicProfileMock.mockImplementation((user: any) => ({
      id: user.id,
      role: user.role,
      profileSlug: user.profileSlug,
      callSign: user.callSign ?? null,
      pronouns: user.pronouns ?? null,
      avatarUrl: null,
      avatarMediaType: 'image',
      avatarMediaUrl: null,
      avatarMimeType: null,
      avatarFilename: null,
      bio: null,
      skills: [],
      links: [],
      honorBadges: [],
      lastActiveAt: user.lastActiveAt ?? null,
      currentRoute: user.currentRoute ?? null,
      createdAt: '2026-04-08T00:00:00.000Z',
      updatedAt: '2026-04-08T00:00:00.000Z',
    }));
  });

  it('returns public redacted crew records without activity signals', async () => {
    const payload = createPayload();
    payload.find.mockResolvedValue({
      docs: [createUser()],
      page: 1,
      totalDocs: 1,
      totalPages: 1,
    });
    authenticateRequestMock.mockResolvedValue({
      payload,
      user: null,
    });

    const { GET } = await import('@/app/api/crew/route');
    const response = await GET(makeRequest('?q=nova&limit=20'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Access-Class')).toBe('public');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=30');
    expect(body.pagination).toMatchObject({
      page: 1,
      limit: 20,
      totalDocs: 1,
      totalPages: 1,
    });
    expect(body.members).toEqual([
      expect.objectContaining({
        profileSlug: 'nova',
        callSign: 'Nova',
        displayName: 'Nova',
      }),
    ]);
    expect(body.members[0]).not.toHaveProperty('isOnline');
    expect(body.members[0]).not.toHaveProperty('lastActiveAt');
    expect(body.members[0]).not.toHaveProperty('currentRoute');

    const query = payload.find.mock.calls[0][0];
    expect(hasNonTestUserClause(query.where)).toBe(true);
    const filters = extractSearchFilters(query.where);
    expect(filters.some((entry) => Object.prototype.hasOwnProperty.call(entry, 'firstName'))).toBe(false);
    expect(filters.some((entry) => Object.prototype.hasOwnProperty.call(entry, 'lastName'))).toBe(false);
  });

  it('returns authenticated crew records with activity signals and expanded search filters', async () => {
    const payload = createPayload();
    payload.find.mockResolvedValue({
      docs: [
        createUser({
          lastActiveAt: new Date().toISOString(),
          currentRoute: '/gangway',
        }),
      ],
      page: 1,
      totalDocs: 1,
      totalPages: 1,
    });
    authenticateRequestMock.mockResolvedValue({
      payload,
      user: { id: 1, role: 'captain' },
    });

    const { GET } = await import('@/app/api/crew/route');
    const response = await GET(makeRequest('?q=nova'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-API-Access-Class')).toBe('authenticated');
    expect(response.headers.get('Cache-Control')).toBeNull();
    expect(body.members[0]).toEqual(
      expect.objectContaining({
        profileSlug: 'nova',
        isOnline: true,
        currentRoute: '/gangway',
      }),
    );
    expect(typeof body.members[0].lastActiveAt).toBe('string');

    const query = payload.find.mock.calls[0][0];
    expect(hasNonTestUserClause(query.where)).toBe(true);
    const filters = extractSearchFilters(query.where);
    expect(filters.some((entry) => Object.prototype.hasOwnProperty.call(entry, 'firstName'))).toBe(true);
    expect(filters.some((entry) => Object.prototype.hasOwnProperty.call(entry, 'lastName'))).toBe(true);
  });
});
