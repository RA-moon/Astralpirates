import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { GET } from './route';
import * as authModule from '@/app/api/_lib/auth';
import * as membersModule from '@/app/api/_lib/flightPlanMembers';
import * as accessPolicyModule from '@/app/api/_lib/accessPolicy';

vi.mock('@/src/utils/redisClient', () => ({
  getRedisClient: () => ({
    duplicate: () => ({
      on: vi.fn(),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      removeAllListeners: vi.fn(),
    }),
  }),
}));

const routeContext = { params: Promise.resolve({ slug: 'demo' }) };
const makeRequest = () => new Request('https://example.com/api/flight-plans/demo/tasks/stream') as any;

describe('flight plan task stream access gate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    vi.spyOn(membersModule, 'sanitizeFlightPlanSlug').mockImplementation((value) => String(value ?? '').trim());
    vi.spyOn(membersModule, 'normaliseId').mockImplementation((value) => {
      if (typeof value === 'number') return Number.isFinite(value) ? value : null;
      if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number.parseInt(value, 10);
        return Number.isNaN(parsed) ? null : parsed;
      }
      if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
        return (value as { id?: number }).id ?? null;
      }
      return null;
    });

    vi.spyOn(membersModule, 'resolveFlightPlanBySlug').mockResolvedValue({
      id: 77,
      owner: 11,
      accessPolicy: { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'passenger' },
      visibility: 'passengers',
      isPublic: false,
      publicContributions: false,
    } as any);

    vi.spyOn(membersModule, 'loadMembershipWithOwnerFallback').mockResolvedValue(null);
    vi.spyOn(accessPolicyModule, 'canUserReadFlightPlan').mockReturnValue(false);
  });

  it('returns 401 when unauthenticated viewer cannot read the mission', async () => {
    vi.spyOn(authModule, 'authenticateRequest').mockResolvedValue({
      user: null,
      payload: { logger: { info: vi.fn(), warn: vi.fn() } },
    } as any);

    const response = await GET(makeRequest(), routeContext as any);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Crew access required.' });

    expect(membersModule.loadMembershipWithOwnerFallback).not.toHaveBeenCalled();
    expect(accessPolicyModule.canUserReadFlightPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        user: null,
        membershipRole: null,
      }),
    );
  });

  it('returns 403 for authenticated viewer denied by resolver and forwards accepted membership role', async () => {
    vi.spyOn(authModule, 'authenticateRequest').mockResolvedValue({
      user: { id: 42, role: 'swabbie' },
      payload: { logger: { info: vi.fn(), warn: vi.fn() } },
    } as any);

    (membersModule.loadMembershipWithOwnerFallback as Mock).mockResolvedValue({
      id: 5,
      flightPlanId: 77,
      userId: 42,
      role: 'crew',
      status: 'accepted',
    });

    const response = await GET(makeRequest(), routeContext as any);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Crew access required.' });

    expect(accessPolicyModule.canUserReadFlightPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        user: { id: 42, role: 'swabbie' },
        ownerId: 11,
        membershipRole: 'crew',
      }),
    );
  });

  it('sends null membership role when membership is not accepted', async () => {
    vi.spyOn(authModule, 'authenticateRequest').mockResolvedValue({
      user: { id: 42, role: 'swabbie' },
      payload: { logger: { info: vi.fn(), warn: vi.fn() } },
    } as any);

    (membersModule.loadMembershipWithOwnerFallback as Mock).mockResolvedValue({
      id: 5,
      flightPlanId: 77,
      userId: 42,
      role: 'crew',
      status: 'pending',
    });

    const response = await GET(makeRequest(), routeContext as any);
    expect(response.status).toBe(403);

    expect(accessPolicyModule.canUserReadFlightPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        membershipRole: null,
      }),
    );
  });
});
