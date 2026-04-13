import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET, POST } from './route';
import * as authModule from '@/app/api/_lib/auth';
import * as flightPlanMembersModule from '@/app/api/_lib/flightPlanMembers';
import * as notificationsModule from '@/src/services/notifications/flightPlans';

type MockedAuth = Awaited<ReturnType<typeof authModule.authenticateRequest>>;

const createRequest = (body?: Record<string, unknown>) => {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new Request('https://example.com/api/flight-plans/demo/members', init) as unknown as any;
};

const createGetRequest = () =>
  new Request('https://example.com/api/flight-plans/demo/members', {
    method: 'GET',
  }) as unknown as any;

describe('POST /api/flight-plans/:slug/members', () => {
  let payload: any;
  let mockAuth: MockedAuth;

  beforeEach(() => {
    vi.restoreAllMocks();
    payload = {
      find: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockAuth = {
      user: {
        id: 77,
        role: 'captain',
        callSign: 'Sky Captain',
        profileSlug: 'sky-captain',
      } as any,
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
      slug: 'demo',
      title: 'Demo Mission',
    } as any);
    vi.spyOn(flightPlanMembersModule, 'ownerCanInvite').mockResolvedValue(true);
    vi.spyOn(flightPlanMembersModule, 'inviteMember').mockResolvedValue({
      id: 9001,
      flightPlanId: 501,
      userId: 91,
      role: 'guest',
      status: 'pending',
      invitedById: 77,
      invitedAt: '2026-04-10T12:00:00.000Z',
      respondedAt: null,
    });
    vi.spyOn(notificationsModule, 'notifyFlightPlanInvitationReceived').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit invite flow without pre-existing mission membership', async () => {
    payload.find.mockResolvedValue({
      docs: [
        {
          id: 91,
          profileSlug: 'crew-neo',
          callSign: 'Crew Neo',
          role: 'seamen',
        },
      ],
    });

    const response = await POST(createRequest({ slug: 'crew-neo' }), {
      params: Promise.resolve({ slug: 'demo' }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(flightPlanMembersModule.ownerCanInvite).toHaveBeenCalledWith({
      payload,
      flightPlanId: 501,
      userId: 77,
      ownerIdHint: 12,
      websiteRole: 'captain',
      adminMode: expect.objectContaining({
        adminViewEnabled: true,
        adminEditEnabled: true,
      }),
    });
    expect(flightPlanMembersModule.inviteMember).toHaveBeenCalledWith(
      expect.objectContaining({
        payload,
        flightPlanId: 501,
        inviterId: 77,
        targetUser: expect.objectContaining({ id: 91 }),
      }),
    );
    expect(notificationsModule.notifyFlightPlanInvitationReceived).toHaveBeenCalledWith({
      payload,
      inviteeId: 91,
      ownerCallsign: 'Sky Captain',
      planSlug: 'demo',
      planTitle: 'Demo Mission',
    });
    expect(body.membership).toEqual(
      expect.objectContaining({
        flightPlanId: 501,
        userId: 91,
        role: 'guest',
        status: 'pending',
      }),
    );
  });

  it('keeps denying invites when ownership/admin override admission fails', async () => {
    vi.spyOn(flightPlanMembersModule, 'ownerCanInvite').mockResolvedValueOnce(false);

    const response = await POST(createRequest({ slug: 'crew-neo' }), {
      params: Promise.resolve({ slug: 'demo' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Only the captain can invite new collaborators unless captain admin edit mode is enabled.',
    });
    expect(payload.find).not.toHaveBeenCalled();
    expect(flightPlanMembersModule.inviteMember).not.toHaveBeenCalled();
    expect(notificationsModule.notifyFlightPlanInvitationReceived).not.toHaveBeenCalled();
  });

  it('keeps denying non-captains with spoofed admin toggles for invites', async () => {
    mockAuth.user = {
      id: 88,
      role: 'seamen',
      callSign: 'Deckhand',
      profileSlug: 'deckhand',
    } as any;
    mockAuth.adminMode = {
      adminViewEnabled: true,
      adminEditEnabled: true,
      eligibility: {
        canUseAdminView: false,
        canUseAdminEdit: false,
      },
    } as any;
    vi.spyOn(flightPlanMembersModule, 'ownerCanInvite').mockResolvedValueOnce(false);

    const response = await POST(createRequest({ slug: 'crew-neo' }), {
      params: Promise.resolve({ slug: 'demo' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Only the captain can invite new collaborators unless captain admin edit mode is enabled.',
    });
    expect(payload.find).not.toHaveBeenCalled();
    expect(flightPlanMembersModule.inviteMember).not.toHaveBeenCalled();
    expect(notificationsModule.notifyFlightPlanInvitationReceived).not.toHaveBeenCalled();
  });
});

describe('GET /api/flight-plans/:slug/members', () => {
  let payload: any;
  let mockAuth: MockedAuth;

  beforeEach(() => {
    vi.restoreAllMocks();
    payload = {
      find: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockAuth = {
      user: {
        id: 77,
        role: 'captain',
      } as any,
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
      slug: 'demo',
      title: 'Demo Mission',
      visibility: 'crew',
      accessPolicy: { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'crew' },
      isPublic: false,
      publicContributions: false,
    } as any);
    vi.spyOn(flightPlanMembersModule, 'hasAdminEditOverrideForUser').mockReturnValue(true);
    vi.spyOn(flightPlanMembersModule, 'loadMembershipWithOwnerFallback').mockResolvedValue(null);
    vi.spyOn(flightPlanMembersModule, 'listMembershipsForFlightPlan').mockResolvedValue([
      {
        id: 2001,
        flightPlanId: 501,
        userId: 91,
        role: 'owner',
        status: 'accepted',
        invitedById: 12,
        invitedAt: '2026-04-10T10:00:00.000Z',
        respondedAt: '2026-04-10T10:01:00.000Z',
      },
      {
        id: 2002,
        flightPlanId: 501,
        userId: 92,
        role: 'guest',
        status: 'pending',
        invitedById: 91,
        invitedAt: '2026-04-10T10:02:00.000Z',
        respondedAt: null,
      },
    ] as any);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit roster read without mission membership and returns unsanitized roster', async () => {
    payload.find
      .mockResolvedValueOnce({
        docs: [
          { id: 91, callSign: 'Owner One', profileSlug: 'owner-one', role: 'captain' },
          { id: 92, callSign: 'Guest Two', profileSlug: 'guest-two', role: 'swabbie' },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          { id: 91, callSign: 'Owner One', profileSlug: 'owner-one', role: 'captain' },
          { id: 12, callSign: 'Legacy Captain', profileSlug: 'legacy-captain', role: 'captain' },
        ],
      });

    const response = await GET(createGetRequest(), {
      params: Promise.resolve({ slug: 'demo' }),
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
    expect(body.memberships).toHaveLength(2);
    expect(body.memberships[0]).toEqual(
      expect.objectContaining({
        id: 2001,
        flightPlanId: 501,
        userId: 91,
        role: 'owner',
        invitedBy: expect.objectContaining({
          id: 12,
          callSign: 'Legacy Captain',
        }),
      }),
    );
  });

  it('keeps denying non-members when admin-edit override is unavailable', async () => {
    mockAuth.user = { id: 55, role: 'seamen' } as any;
    mockAuth.adminMode = {
      adminViewEnabled: false,
      adminEditEnabled: false,
      eligibility: {
        canUseAdminView: false,
        canUseAdminEdit: false,
      },
    } as any;
    vi.spyOn(flightPlanMembersModule, 'hasAdminEditOverrideForUser').mockReturnValueOnce(false);
    vi.spyOn(flightPlanMembersModule, 'loadMembershipWithOwnerFallback').mockResolvedValueOnce(null);

    const response = await GET(createGetRequest(), {
      params: Promise.resolve({ slug: 'demo' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Crew roster is limited to the captain and confirmed crew.',
    });
    expect(flightPlanMembersModule.listMembershipsForFlightPlan).not.toHaveBeenCalled();
    expect(payload.find).not.toHaveBeenCalled();
  });
});
