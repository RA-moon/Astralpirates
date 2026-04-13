import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
  buildRequestForUser: vi.fn(),
}));

vi.mock('@/app/api/_lib/slugs', () => ({
  ensureUniqueSlug: vi.fn(),
}));

vi.mock('@/app/api/_lib/userActivity', () => ({
  touchUserActivity: vi.fn(),
}));

vi.mock('@/app/api/_lib/content', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/content')>(
    '@/app/api/_lib/content',
  );
  return {
    ...actual,
    sanitizeLog: vi.fn((doc: any) => doc),
  };
});

vi.mock('@/app/api/_lib/flightPlanMembers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/flightPlanMembers')>(
    '@/app/api/_lib/flightPlanMembers',
  );
  return {
    ...actual,
    loadMembership: vi.fn(),
    ensureCrewMembership: vi.fn(),
  };
});

import { POST } from '@/app/api/logs/route';
import { authenticateRequest, buildRequestForUser } from '@/app/api/_lib/auth';
import { ensureUniqueSlug } from '@/app/api/_lib/slugs';
import { touchUserActivity } from '@/app/api/_lib/userActivity';
import { ensureCrewMembership, loadMembership } from '@/app/api/_lib/flightPlanMembers';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedBuildRequestForUser = vi.mocked(buildRequestForUser);
const mockedEnsureUniqueSlug = vi.mocked(ensureUniqueSlug);
const mockedTouchUserActivity = vi.mocked(touchUserActivity);
const mockedLoadMembership = vi.mocked(loadMembership);
const mockedEnsureCrewMembership = vi.mocked(ensureCrewMembership);

const makeRequest = (body: Record<string, unknown>) =>
  ({
    headers: new Headers(),
    json: async () => body,
  }) as unknown as NextRequest;

describe('POST /api/logs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit override to attach logs without pre-existing membership', async () => {
    const payload = {
      create: vi.fn().mockResolvedValue({
        id: 501,
        slug: '20260101120000',
        path: '/bridge/logs/20260101120000',
        title: '20260101120000 Captain Demo',
        headline: 'Demo',
        body: 'Captain note',
        flightPlan: 44,
        owner: 77,
      }),
      logger: {
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 77, role: 'captain', callSign: 'Captain' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    } as any);
    mockedLoadMembership.mockResolvedValue(null);
    mockedEnsureCrewMembership.mockResolvedValue({
      id: 910,
      flightPlanId: 44,
      userId: 77,
      role: 'crew',
      status: 'accepted',
      invitedById: 77,
      invitedAt: '2025-01-01T00:00:00.000Z',
      respondedAt: '2025-01-01T00:00:00.000Z',
    } as any);
    mockedEnsureUniqueSlug.mockResolvedValue('20260101120000');
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedTouchUserActivity.mockResolvedValue();

    const response = await POST(
      makeRequest({
        title: 'Demo',
        body: 'Captain note',
        flightPlanId: 44,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.log?.flightPlan).toBe(44);
    expect(mockedLoadMembership).toHaveBeenCalledWith(payload, 44, 77);
    expect(mockedEnsureCrewMembership).toHaveBeenCalledWith({
      payload,
      flightPlanId: 44,
      userId: 77,
      inviterId: 77,
    });
  });

  it('does not allow spoofed admin toggles for non-captain log attachment', async () => {
    const payload = {
      create: vi.fn(),
      logger: {
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 88, role: 'seamen', callSign: 'Deckhand' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: false,
          canUseAdminEdit: false,
        },
      },
    } as any);
    mockedLoadMembership.mockResolvedValue(null);
    mockedEnsureCrewMembership.mockResolvedValue(null as any);
    mockedEnsureUniqueSlug.mockResolvedValue('20260101120000');
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedTouchUserActivity.mockResolvedValue();

    const response = await POST(
      makeRequest({
        title: 'Denied',
        body: 'No membership',
        flightPlanId: 44,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({
      error: 'Only crew members can attach logs to this flight plan.',
    });
    expect(mockedEnsureCrewMembership).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
  });
});
