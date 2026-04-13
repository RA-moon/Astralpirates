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
    resolveFlightPlanBySlug: vi.fn(),
    loadMembershipWithOwnerFallback: vi.fn(),
    loadMembershipById: vi.fn(),
    updateMembershipRole: vi.fn(),
  };
});

vi.mock('@/src/services/notifications/flightPlans', () => ({
  notifyFlightPlanPromotion: vi.fn(),
}));

import { PATCH } from '@/app/api/flight-plans/[slug]/members/[membershipId]/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  loadMembershipById,
  loadMembershipWithOwnerFallback,
  resolveFlightPlanBySlug,
  updateMembershipRole,
} from '@/app/api/_lib/flightPlanMembers';
import { notifyFlightPlanPromotion } from '@/src/services/notifications/flightPlans';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedResolveFlightPlanBySlug = vi.mocked(resolveFlightPlanBySlug);
const mockedLoadMembershipWithOwnerFallback = vi.mocked(loadMembershipWithOwnerFallback);
const mockedLoadMembershipById = vi.mocked(loadMembershipById);
const mockedUpdateMembershipRole = vi.mocked(updateMembershipRole);
const mockedNotifyFlightPlanPromotion = vi.mocked(notifyFlightPlanPromotion);

const makeRequest = (body: any) =>
  ({
    headers: new Headers(),
    json: async () => body,
  }) as unknown as NextRequest;

describe('PATCH /api/flight-plans/:slug/members/:membershipId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit override to promote without actor membership', async () => {
    const payload = {
      logger: {
        warn: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 77, role: 'captain' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    } as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 44,
      owner: { id: 5 },
      slug: 'demo',
      title: 'Demo Plan',
      crewCanPromotePassengers: false,
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue(null);
    mockedLoadMembershipById.mockResolvedValue({
      id: 90,
      flightPlanId: 44,
      userId: 101,
      role: 'guest',
      status: 'accepted',
      invitedById: 5,
      invitedAt: '2025-01-01T00:00:00.000Z',
      respondedAt: '2025-01-02T00:00:00.000Z',
    });
    mockedUpdateMembershipRole.mockResolvedValue({
      id: 90,
      flightPlanId: 44,
      userId: 101,
      role: 'crew',
      status: 'accepted',
      invitedById: 5,
      invitedAt: '2025-01-01T00:00:00.000Z',
      respondedAt: '2025-01-02T00:00:00.000Z',
    } as any);

    const response = await PATCH(makeRequest({ action: 'promote', role: 'crew' }), {
      params: Promise.resolve({ slug: 'demo', membershipId: '90' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.membership.role).toBe('crew');
    expect(mockedLoadMembershipWithOwnerFallback).toHaveBeenCalled();
    expect(mockedUpdateMembershipRole).toHaveBeenCalledWith({
      payload,
      membership: expect.objectContaining({ id: 90, role: 'guest' }),
      nextRole: 'crew',
    });
    expect(mockedNotifyFlightPlanPromotion).toHaveBeenCalledWith({
      payload,
      memberId: 101,
      planSlug: 'demo',
      planTitle: 'Demo Plan',
    });
  });

  it('keeps denying non-captains with spoofed admin toggles', async () => {
    const payload = {
      logger: {
        warn: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 88, role: 'seamen' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: false,
          canUseAdminEdit: false,
        },
      },
    } as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 44,
      owner: { id: 5 },
      slug: 'demo',
      title: 'Demo Plan',
      crewCanPromotePassengers: false,
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue(null);

    const response = await PATCH(makeRequest({ action: 'promote', role: 'crew' }), {
      params: Promise.resolve({ slug: 'demo', membershipId: '90' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/captain/i);
    expect(mockedLoadMembershipById).not.toHaveBeenCalled();
    expect(mockedUpdateMembershipRole).not.toHaveBeenCalled();
    expect(mockedNotifyFlightPlanPromotion).not.toHaveBeenCalled();
  });
});
