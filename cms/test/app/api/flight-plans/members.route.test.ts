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
    ownerCanInvite: vi.fn(),
    inviteMember: vi.fn(),
    listMembershipsForFlightPlan: vi.fn(),
    loadMembership: vi.fn(),
    loadMembershipWithOwnerFallback: vi.fn(),
  };
});

import { GET, POST } from '@/app/api/flight-plans/[slug]/members/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  inviteMember,
  ownerCanInvite,
  resolveFlightPlanBySlug,
  listMembershipsForFlightPlan,
  loadMembershipWithOwnerFallback,
  type FlightPlanMembershipRecord,
} from '@/app/api/_lib/flightPlanMembers';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedResolveFlightPlanBySlug = vi.mocked(resolveFlightPlanBySlug);
const mockedOwnerCanInvite = vi.mocked(ownerCanInvite);
const mockedInviteMember = vi.mocked(inviteMember);
const mockedListMembershipsForFlightPlan = vi.mocked(listMembershipsForFlightPlan);
const mockedLoadMembershipWithOwnerFallback = vi.mocked(loadMembershipWithOwnerFallback);

const makeRequest = (body: any) =>
  ({
    headers: new Headers(),
    json: async () => body,
  }) as unknown as NextRequest;

const makeGetRequest = () =>
  ({
    headers: new Headers(),
  }) as unknown as NextRequest;

const buildAuthContext = () => {
  const payload = {
    find: vi.fn(),
    logger: {
      error: vi.fn(),
    },
  };
  return { payload, user: { id: 1, profileSlug: 'captain', role: 'captain' } };
};

describe('POST /api/flight-plans/:slug/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it('rejects crew organisers attempting to invite', async () => {
    const authContext = buildAuthContext();
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({ id: 10, owner: { id: 99 } } as any);
    mockedOwnerCanInvite.mockResolvedValue(false);

    const response = await POST(makeRequest({ slug: 'crew-one' }), { params: { slug: 'mission' } });
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Only the captain/);

    expect(mockedOwnerCanInvite).toHaveBeenCalledWith({
      payload: authContext.payload,
      flightPlanId: 10,
      userId: authContext.user.id,
      ownerIdHint: 99,
      websiteRole: authContext.user.role,
      adminMode: undefined,
    });
  });

  it('allows captains to invite collaborators after lookup', async () => {
    const authContext = buildAuthContext();
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({ id: 15, owner: { id: 4 } } as any);
    mockedOwnerCanInvite.mockResolvedValue(true);
    authContext.payload.find.mockResolvedValue({
      docs: [{ id: 2, profileSlug: 'helmsman', callSign: 'Helmsman', role: 'seamen' }],
    });

    const membership: FlightPlanMembershipRecord = {
      id: 99,
      flightPlanId: 15,
      userId: 2,
      role: 'guest',
      status: 'pending',
      invitedById: 1,
      invitedAt: '2025-01-01T00:00:00.000Z',
      respondedAt: null,
    };
    mockedInviteMember.mockResolvedValue(membership);

    const response = await POST(makeRequest({ slug: 'helmsman' }), { params: { slug: 'mission' } });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.membership.id).toBe(99);
    expect(mockedInviteMember).toHaveBeenCalledWith({
      payload: authContext.payload,
      flightPlanId: 15,
      inviterId: authContext.user.id,
      targetUser: expect.objectContaining({ profileSlug: 'helmsman' }),
    });
  });

  it('forwards admin-mode context into ownerCanInvite for captain override paths', async () => {
    const authContext = {
      ...buildAuthContext(),
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    };
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({ id: 23, owner: { id: 5 } } as any);
    mockedOwnerCanInvite.mockResolvedValue(true);
    authContext.payload.find.mockResolvedValue({
      docs: [{ id: 9, profileSlug: 'navigator', callSign: 'Navigator', role: 'seamen' }],
    });

    const membership: FlightPlanMembershipRecord = {
      id: 199,
      flightPlanId: 23,
      userId: 9,
      role: 'guest',
      status: 'pending',
      invitedById: 1,
      invitedAt: '2025-01-01T00:00:00.000Z',
      respondedAt: null,
    };
    mockedInviteMember.mockResolvedValue(membership);

    const response = await POST(makeRequest({ slug: 'navigator' }), { params: { slug: 'mission' } });

    expect(response.status).toBe(201);
    expect(mockedOwnerCanInvite).toHaveBeenCalledWith({
      payload: authContext.payload,
      flightPlanId: 23,
      userId: authContext.user.id,
      ownerIdHint: 5,
      websiteRole: authContext.user.role,
      adminMode: authContext.adminMode,
    });
  });

  it('keeps denying non-captains with spoofed admin toggles for invites', async () => {
    const authContext = {
      ...buildAuthContext(),
      user: { id: 88, profileSlug: 'deckhand', role: 'seamen' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: false,
          canUseAdminEdit: false,
        },
      },
    };
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({ id: 23, owner: { id: 5 } } as any);
    mockedOwnerCanInvite.mockResolvedValue(false);

    const response = await POST(makeRequest({ slug: 'navigator' }), { params: { slug: 'mission' } });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/only the captain/i);
    expect(mockedOwnerCanInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        websiteRole: 'seamen',
        adminMode: expect.objectContaining({
          adminViewEnabled: true,
          adminEditEnabled: true,
        }),
      }),
    );
    expect(mockedInviteMember).not.toHaveBeenCalled();
  });

  it('still restricts invites to captains even when the flag is enabled', async () => {
    const authContext = buildAuthContext();
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 22,
      owner: { id: 5 },
    } as any);
    mockedOwnerCanInvite.mockResolvedValue(false);

    const response = await POST(makeRequest({ slug: 'scout' }), { params: { slug: 'voyage' } });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/Only the captain/);
    expect(mockedOwnerCanInvite).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerIdHint: 5,
      }),
    );
  });
});

describe('GET /api/flight-plans/:slug/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoadMembershipWithOwnerFallback.mockReset();
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue(null);
  });

  it('returns roster for public missions without authentication', async () => {
    const authContext = buildAuthContext();
    mockedAuthenticateRequest.mockResolvedValue({ payload: authContext.payload, user: null } as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 10,
      owner: { id: 5 },
      isPublic: true,
    } as any);
    mockedListMembershipsForFlightPlan.mockResolvedValue([
      {
        id: 1,
        flightPlanId: 10,
        userId: 7,
        role: 'guest',
        status: 'accepted',
        invitedById: null,
        invitedAt: null,
        respondedAt: '2025-01-02T00:00:00.000Z',
      },
    ]);
    authContext.payload.find.mockResolvedValue({
      docs: [{ id: 7, callSign: 'Scout', profileSlug: 'scout', role: 'seaman' }],
    });

    const response = await GET(makeGetRequest(), { params: { slug: 'voyage' } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0]).toMatchObject({
      id: null,
      flightPlanId: null,
      userId: null,
      invitedBy: null,
      invitedAt: null,
      respondedAt: null,
      role: 'guest',
      status: 'accepted',
      user: expect.objectContaining({
        callSign: 'Scout',
        profileSlug: 'scout',
      }),
    });
  });

  it('rejects unauthenticated access when mission is private', async () => {
    const authContext = buildAuthContext();
    mockedAuthenticateRequest.mockResolvedValue({ payload: authContext.payload, user: null } as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 10,
      owner: { id: 5 },
      isPublic: false,
    } as any);

    const response = await GET(makeGetRequest(), { params: { slug: 'voyage' } });
    expect(response.status).toBe(401);
  });

  it('rejects passengers attempting to load private rosters until accepted', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 7, callSign: 'Scout', profileSlug: 'scout', role: 'seaman' }],
      }),
      logger: {
        error: vi.fn(),
      },
    };
    const authContext = { payload, user: { id: 2, profileSlug: 'scout', role: 'seaman' } };
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 33,
      owner: { id: 5 },
      isPublic: false,
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue({
      id: 90,
      flightPlanId: 33,
      userId: 2,
      role: 'guest',
      status: 'pending',
      invitedById: 5,
      invitedAt: '2025-01-03T00:00:00.000Z',
      respondedAt: '2025-01-04T00:00:00.000Z',
    });
    mockedListMembershipsForFlightPlan.mockResolvedValue([
      {
        id: 90,
        flightPlanId: 33,
        userId: 2,
        role: 'guest',
        status: 'pending',
        invitedById: 5,
        invitedAt: '2025-01-03T00:00:00.000Z',
        respondedAt: '2025-01-04T00:00:00.000Z',
      },
    ]);

    const response = await GET(makeGetRequest(), { params: { slug: 'voyage' } });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toMatch(/captain and confirmed crew/i);
    expect(mockedListMembershipsForFlightPlan).not.toHaveBeenCalled();
  });

  it('allows accepted passengers to load private rosters', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 7, callSign: 'Scout', profileSlug: 'scout', role: 'seaman' }],
      }),
      logger: {
        error: vi.fn(),
      },
    };
    const authContext = { payload, user: { id: 2, profileSlug: 'scout', role: 'seaman' } };
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 33,
      owner: { id: 5 },
      isPublic: false,
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue({
      id: 90,
      flightPlanId: 33,
      userId: 2,
      role: 'guest',
      status: 'accepted',
      invitedById: 5,
      invitedAt: '2025-01-03T00:00:00.000Z',
      respondedAt: '2025-01-04T00:00:00.000Z',
    });
    mockedListMembershipsForFlightPlan.mockResolvedValue([
      {
        id: 90,
        flightPlanId: 33,
        userId: 2,
        role: 'guest',
        status: 'accepted',
        invitedById: 5,
        invitedAt: '2025-01-03T00:00:00.000Z',
        respondedAt: '2025-01-04T00:00:00.000Z',
      },
    ]);

    const response = await GET(makeGetRequest(), { params: { slug: 'voyage' } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0].id).toBe(90);
  });

  it('allows accepted crew to load private rosters', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 7, callSign: 'Scout', profileSlug: 'scout', role: 'seaman' }],
      }),
      logger: {
        error: vi.fn(),
      },
    };
    const authContext = { payload, user: { id: 2, profileSlug: 'scout', role: 'seaman' } };
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 33,
      owner: { id: 5 },
      isPublic: false,
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue({
      id: 91,
      flightPlanId: 33,
      userId: 2,
      role: 'crew',
      status: 'accepted',
      invitedById: 5,
      invitedAt: '2025-01-03T00:00:00.000Z',
      respondedAt: '2025-01-04T00:00:00.000Z',
    });
    mockedListMembershipsForFlightPlan.mockResolvedValue([
      {
        id: 91,
        flightPlanId: 33,
        userId: 2,
        role: 'crew',
        status: 'accepted',
        invitedById: 5,
        invitedAt: '2025-01-03T00:00:00.000Z',
        respondedAt: '2025-01-04T00:00:00.000Z',
      },
    ]);

    const response = await GET(makeGetRequest(), { params: { slug: 'voyage' } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0].id).toBe(91);
  });

  it('allows captain admin-edit override to load private rosters without membership', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 7, callSign: 'Scout', profileSlug: 'scout', role: 'seaman' }],
      }),
      logger: {
        error: vi.fn(),
      },
    };
    const authContext = {
      payload,
      user: { id: 2, profileSlug: 'captain', role: 'captain' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    };
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 33,
      owner: { id: 5 },
      isPublic: false,
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue(null);
    mockedListMembershipsForFlightPlan.mockResolvedValue([
      {
        id: 90,
        flightPlanId: 33,
        userId: 7,
        role: 'guest',
        status: 'accepted',
        invitedById: null,
        invitedAt: '2025-01-03T00:00:00.000Z',
        respondedAt: '2025-01-04T00:00:00.000Z',
      },
    ]);

    const response = await GET(makeGetRequest(), { params: { slug: 'voyage' } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.memberships).toHaveLength(1);
    expect(body.memberships[0].id).toBe(90);
    expect(body.memberships[0].user?.id).toBe(7);
  });

  it('keeps denying non-captains with spoofed admin toggles on private roster reads', async () => {
    const payload = {
      find: vi.fn(),
      logger: {
        error: vi.fn(),
      },
    };
    const authContext = {
      payload,
      user: { id: 88, profileSlug: 'deckhand', role: 'seamen' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: false,
          canUseAdminEdit: false,
        },
      },
    };
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 33,
      owner: { id: 5 },
      isPublic: false,
      publicContributions: false,
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue(null);

    const response = await GET(makeGetRequest(), { params: { slug: 'voyage' } });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/crew roster is limited/i);
    expect(mockedListMembershipsForFlightPlan).not.toHaveBeenCalled();
  });

  it('returns full roster data for captains on public missions', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [
          { id: 5, callSign: 'Nova', profileSlug: 'nova', role: 'captain' },
          { id: 7, callSign: 'Scout', profileSlug: 'scout', role: 'seaman' },
        ],
      }),
      logger: {
        error: vi.fn(),
      },
    };
    const authContext = { payload, user: { id: 5, profileSlug: 'nova', role: 'captain' } };
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 44,
      owner: { id: 5 },
      isPublic: true,
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue({
      id: 500,
      flightPlanId: 44,
      userId: 5,
      role: 'owner',
      status: 'accepted',
      invitedById: null,
      invitedAt: '2025-01-01T00:00:00.000Z',
      respondedAt: '2025-01-02T00:00:00.000Z',
    });
    mockedListMembershipsForFlightPlan.mockResolvedValue([
      {
        id: 500,
        flightPlanId: 44,
        userId: 5,
        role: 'owner',
        status: 'accepted',
        invitedById: null,
        invitedAt: '2025-01-01T00:00:00.000Z',
        respondedAt: '2025-01-02T00:00:00.000Z',
      },
    ]);

    const response = await GET(makeGetRequest(), { params: { slug: 'voyage' } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.memberships[0]).toMatchObject({
      id: 500,
      userId: 5,
      invitedAt: '2025-01-01T00:00:00.000Z',
      respondedAt: '2025-01-02T00:00:00.000Z',
    });
  });
});
