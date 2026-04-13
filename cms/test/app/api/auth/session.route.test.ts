import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  getPayloadInstanceMock,
  jwtVerifyMock,
  sanitizePrivateProfileMock,
  resolveHonorBadgeMediaByCodeMock,
} = vi.hoisted(() => ({
  getPayloadInstanceMock: vi.fn(),
  jwtVerifyMock: vi.fn(),
  sanitizePrivateProfileMock: vi.fn((user: any) => user),
  resolveHonorBadgeMediaByCodeMock: vi.fn(async () => new Map()),
}));

vi.mock('@/app/lib/payload', () => ({
  getPayloadInstance: getPayloadInstanceMock,
}));

vi.mock('jose', () => ({
  jwtVerify: jwtVerifyMock,
}));

vi.mock('@/app/api/profiles/_lib/sanitize', () => ({
  sanitizePrivateProfile: sanitizePrivateProfileMock,
  resolveHonorBadgeMediaByCode: resolveHonorBadgeMediaByCodeMock,
}));

import { GET as getSession } from '@/app/api/auth/session/route';

const makeRequest = (headers: Headers) =>
  ({
    headers,
    nextUrl: { pathname: '/api/auth/session' },
  }) as unknown as NextRequest;

const buildPayload = () => ({
  secret: 'test-secret',
  config: { cookiePrefix: 'payload' },
  collections: {
    users: {
      config: {
        slug: 'users',
        auth: { useSessions: false },
      },
    },
  },
  findByID: vi.fn().mockResolvedValue({
    id: 7,
    email: 'captain@astralpirates.com',
    role: 'captain',
    profileSlug: 'captain-test',
    callSign: 'Captain',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  logger: {
    warn: vi.fn(),
  },
});

describe('auth session route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when bearer token verification fails and no cookie token is available', async () => {
    const payload = buildPayload();
    getPayloadInstanceMock.mockResolvedValue(payload);
    jwtVerifyMock.mockRejectedValue(new Error('signature verification failed'));

    const request = makeRequest(new Headers({ Authorization: 'Bearer stale-token' }));
    const response = await getSession(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Authentication required.',
    });
    expect(jwtVerifyMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to cookie token when bearer token verification fails', async () => {
    const payload = buildPayload();
    getPayloadInstanceMock.mockResolvedValue(payload);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    jwtVerifyMock
      .mockRejectedValueOnce(new Error('signature verification failed'))
      .mockResolvedValueOnce({
        payload: {
          id: 7,
          collection: 'users',
          sid: 'sid-1',
          exp,
        },
      });

    const headers = new Headers({
      Authorization: 'Bearer stale-token',
      Cookie: 'payload-token=cookie-token',
    });
    const response = await getSession(makeRequest(headers));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      token: 'cookie-token',
      exp: String(exp),
      user: {
        id: 7,
      },
    });
    expect(jwtVerifyMock).toHaveBeenCalledTimes(2);
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 7,
      }),
    );
  });
});
