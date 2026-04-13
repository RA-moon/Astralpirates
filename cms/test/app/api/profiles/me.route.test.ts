import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
  buildRequestForUser: vi.fn(),
}));

import { GET as getOwnProfile, PATCH as patchOwnProfile } from '@/app/api/profiles/me/route';
import { authenticateRequest } from '@/app/api/_lib/auth';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);

const makeRequest = (method: 'GET' | 'PATCH') =>
  ({
    method,
    headers: new Headers(),
    nextUrl: new URL('https://astralpirates.com/api/profiles/me'),
  }) as unknown as NextRequest;

describe('profiles/me auth delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuthenticateRequest.mockResolvedValue({
      payload: {},
      user: null,
    } as any);
  });

  it('GET uses shared authenticateRequest and returns 401 when unauthenticated', async () => {
    const response = await getOwnProfile(makeRequest('GET'));

    expect(mockedAuthenticateRequest).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
  });

  it('PATCH uses shared authenticateRequest and returns 401 when unauthenticated', async () => {
    const response = await patchOwnProfile(makeRequest('PATCH'));

    expect(mockedAuthenticateRequest).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);
  });
});
