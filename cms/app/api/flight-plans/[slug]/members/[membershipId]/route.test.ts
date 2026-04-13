import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PATCH } from './route';
import * as authModule from '@/app/api/_lib/auth';
import * as flightPlanMembersModule from '@/app/api/_lib/flightPlanMembers';
import * as notificationsModule from '@/src/services/notifications/flightPlans';

type MockedAuth = Awaited<ReturnType<typeof authModule.authenticateRequest>>;

const createRequest = (body?: Record<string, unknown>) => {
  const init: RequestInit = {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new Request('https://example.com/api/flight-plans/demo/members/222', init) as unknown as any;
};

describe('PATCH /api/flight-plans/:slug/members/:membershipId', () => {
  let payload: any;
  let mockAuth: MockedAuth;

  beforeEach(() => {
    vi.restoreAllMocks();
    payload = {
      logger: {
        warn: vi.fn(),
      },
    };
    mockAuth = {
      user: { id: 77, role: 'captain' } as any,
      payload,
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    };

    vi.spyOn(authModule, 'authenticateRequest').mockResolvedValue(mockAuth);
    vi.spyOn(flightPlanMembersModule, 'resolveFlightPlanBySlug').mockResolvedValue({
      id: 501,
      owner: 12,
      crewCanPromotePassengers: false,
      slug: 'demo',
      title: 'Demo Mission',
    } as any);
    vi.spyOn(flightPlanMembersModule, 'hasAdminEditOverrideForUser').mockReturnValue(true);
    vi.spyOn(flightPlanMembersModule, 'loadMembershipWithOwnerFallback').mockResolvedValue(null);
    vi.spyOn(flightPlanMembersModule, 'loadMembershipById').mockResolvedValue({
      id: 222,
      flightPlanId: 501,
      userId: 91,
      role: 'guest',
      status: 'accepted',
      invitedById: 12,
      invitedAt: '2026-04-10T11:00:00.000Z',
      respondedAt: '2026-04-10T11:05:00.000Z',
    });
    vi.spyOn(flightPlanMembersModule, 'updateMembershipRole').mockResolvedValue({
      id: 222,
      flightPlanId: 501,
      userId: 91,
      role: 'crew',
      status: 'accepted',
      invitedById: 12,
      invitedAt: '2026-04-10T11:00:00.000Z',
      respondedAt: '2026-04-10T11:05:00.000Z',
    });
    vi.spyOn(notificationsModule, 'notifyFlightPlanPromotion').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit override to promote even without actor membership', async () => {
    const response = await PATCH(createRequest({ role: 'crew' }), {
      params: Promise.resolve({ slug: 'demo', membershipId: '222' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(flightPlanMembersModule.hasAdminEditOverrideForUser).toHaveBeenCalledWith({
      userId: 77,
      websiteRole: 'captain',
      adminMode: expect.objectContaining({
        adminViewEnabled: true,
        adminEditEnabled: true,
      }),
    });
    expect(flightPlanMembersModule.loadMembershipWithOwnerFallback).toHaveBeenCalledWith({
      payload,
      flightPlanId: 501,
      userId: 77,
      ownerIdHint: 12,
    });
    expect(flightPlanMembersModule.updateMembershipRole).toHaveBeenCalledWith({
      payload,
      membership: expect.objectContaining({
        id: 222,
        flightPlanId: 501,
        userId: 91,
        role: 'guest',
      }),
      nextRole: 'crew',
    });
    expect(notificationsModule.notifyFlightPlanPromotion).toHaveBeenCalledWith({
      payload,
      memberId: 91,
      planSlug: 'demo',
      planTitle: 'Demo Mission',
    });
    expect(body.membership).toEqual(
      expect.objectContaining({
        id: 222,
        flightPlanId: 501,
        role: 'crew',
        status: 'accepted',
      }),
    );
  });

  it('keeps denying when actor is neither owner/crew nor admin-edit override', async () => {
    vi.spyOn(flightPlanMembersModule, 'hasAdminEditOverrideForUser').mockReturnValueOnce(false);
    vi.spyOn(flightPlanMembersModule, 'loadMembershipWithOwnerFallback').mockResolvedValueOnce(null);

    const response = await PATCH(createRequest({ role: 'crew' }), {
      params: Promise.resolve({ slug: 'demo', membershipId: '222' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Only the captain (or crew organisers with permission) can manage crew roles unless captain admin edit mode is enabled.',
    });
    expect(flightPlanMembersModule.loadMembershipById).not.toHaveBeenCalled();
    expect(flightPlanMembersModule.updateMembershipRole).not.toHaveBeenCalled();
    expect(notificationsModule.notifyFlightPlanPromotion).not.toHaveBeenCalled();
  });

  it('keeps denying non-captains with spoofed admin toggles', async () => {
    mockAuth.user = { id: 88, role: 'seamen' } as any;
    mockAuth.adminMode = {
      adminViewEnabled: true,
      adminEditEnabled: true,
      eligibility: {
        canUseAdminView: false,
        canUseAdminEdit: false,
      },
    } as any;
    vi.spyOn(flightPlanMembersModule, 'hasAdminEditOverrideForUser').mockReturnValueOnce(false);
    vi.spyOn(flightPlanMembersModule, 'loadMembershipWithOwnerFallback').mockResolvedValueOnce(null);

    const response = await PATCH(createRequest({ role: 'crew' }), {
      params: Promise.resolve({ slug: 'demo', membershipId: '222' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Only the captain (or crew organisers with permission) can manage crew roles unless captain admin edit mode is enabled.',
    });
    expect(flightPlanMembersModule.updateMembershipRole).not.toHaveBeenCalled();
    expect(notificationsModule.notifyFlightPlanPromotion).not.toHaveBeenCalled();
  });
});
