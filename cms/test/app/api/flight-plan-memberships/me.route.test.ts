import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock('@/app/api/_lib/flightPlanMembers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/flightPlanMembers')>(
    '@/app/api/_lib/flightPlanMembers',
  );
  return {
    ...actual,
    hasAdminEditOverrideForUser: vi.fn(),
    loadMembershipsForUser: vi.fn(),
  };
});

import { GET } from '@/app/api/flight-plan-memberships/me/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  hasAdminEditOverrideForUser,
  loadMembershipsForUser,
} from '@/app/api/_lib/flightPlanMembers';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedHasAdminEditOverrideForUser = vi.mocked(hasAdminEditOverrideForUser);
const mockedLoadMembershipsForUser = vi.mocked(loadMembershipsForUser);

const makeRequest = () => ({ headers: new Headers() }) as unknown as NextRequest;

describe('GET /api/flight-plan-memberships/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns accepted crew memberships only when admin edit override is disabled', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 11, title: 'Atlas', slug: 'atlas', displayDate: '2026-04-10' }],
      }),
      logger: {
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 7, role: 'captain' },
      adminMode: {
        adminViewEnabled: false,
        adminEditEnabled: false,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    } as any);
    mockedHasAdminEditOverrideForUser.mockReturnValue(false);
    mockedLoadMembershipsForUser.mockResolvedValue([
      {
        id: 41,
        flightPlanId: 11,
        userId: 7,
        role: 'crew',
        status: 'accepted',
        invitedById: 3,
        invitedAt: '2026-04-10T00:00:00.000Z',
        respondedAt: '2026-04-10T00:10:00.000Z',
      },
    ] as any);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedHasAdminEditOverrideForUser).toHaveBeenCalledWith({
      userId: 7,
      websiteRole: 'captain',
      adminMode: expect.objectContaining({
        adminViewEnabled: false,
        adminEditEnabled: false,
      }),
    });
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'flight-plans',
        where: {
          id: {
            in: [11],
          },
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      }),
    );
    expect(body.memberships).toEqual([
      {
        membershipId: 41,
        flightPlanId: 11,
        role: 'crew',
        flightPlan: {
          id: 11,
          title: 'Atlas',
          slug: 'atlas',
          displayDate: '2026-04-10',
        },
      },
    ]);
  });

  it('includes non-membership flight plans for captain admin-edit override', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [
          { id: 11, title: 'Atlas', slug: 'atlas', displayDate: '2026-04-10' },
          { id: 22, title: 'Nebula', slug: 'nebula', displayDate: '2026-04-11' },
        ],
      }),
      logger: {
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 7, role: 'captain' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    } as any);
    mockedHasAdminEditOverrideForUser.mockReturnValue(true);
    mockedLoadMembershipsForUser.mockResolvedValue([
      {
        id: 41,
        flightPlanId: 11,
        userId: 7,
        role: 'owner',
        status: 'accepted',
        invitedById: 7,
        invitedAt: '2026-04-10T00:00:00.000Z',
        respondedAt: '2026-04-10T00:00:00.000Z',
      },
    ] as any);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'flight-plans',
        pagination: false,
        depth: 0,
        overrideAccess: true,
      }),
    );
    expect(body.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          membershipId: 41,
          flightPlanId: 11,
          role: 'owner',
          flightPlan: expect.objectContaining({ id: 11, slug: 'atlas' }),
        }),
        expect.objectContaining({
          membershipId: -22,
          flightPlanId: 22,
          role: 'admin-edit-override',
          flightPlan: expect.objectContaining({ id: 22, slug: 'nebula' }),
        }),
      ]),
    );
  });

  it('does not include non-membership plans for non-captain spoofed toggles', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 11, title: 'Atlas', slug: 'atlas', displayDate: '2026-04-10' }],
      }),
      logger: {
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 7, role: 'seamen' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: false,
          canUseAdminEdit: false,
        },
      },
    } as any);
    mockedHasAdminEditOverrideForUser.mockReturnValue(false);
    mockedLoadMembershipsForUser.mockResolvedValue([
      {
        id: 41,
        flightPlanId: 11,
        userId: 7,
        role: 'crew',
        status: 'accepted',
        invitedById: 3,
        invitedAt: '2026-04-10T00:00:00.000Z',
        respondedAt: '2026-04-10T00:10:00.000Z',
      },
    ] as any);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.memberships).toEqual([
      {
        membershipId: 41,
        flightPlanId: 11,
        role: 'crew',
        flightPlan: {
          id: 11,
          title: 'Atlas',
          slug: 'atlas',
          displayDate: '2026-04-10',
        },
      },
    ]);
    expect(body.memberships.some((entry: any) => entry.role === 'admin-edit-override')).toBe(false);
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'flight-plans',
        where: {
          id: {
            in: [11],
          },
        },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      }),
    );
  });
});
