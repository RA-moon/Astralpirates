import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';
import * as authModule from '@/app/api/_lib/auth';
import * as flightPlanMembersModule from '@/app/api/_lib/flightPlanMembers';

type MockedAuth = Awaited<ReturnType<typeof authModule.authenticateRequest>>;

const createRequest = (query?: string) =>
  ({
    headers: new Headers(),
    nextUrl: new URL(
      `https://example.com/api/flight-plans/demo/invitees${query ? `?q=${encodeURIComponent(query)}` : ''}`,
    ),
  }) as unknown as any;

describe('GET /api/flight-plans/:slug/invitees', () => {
  let payload: any;
  let mockAuth: MockedAuth;

  beforeEach(() => {
    vi.restoreAllMocks();
    payload = {
      find: vi.fn(),
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
      slug: 'demo',
      title: 'Demo Mission',
    } as any);
    vi.spyOn(flightPlanMembersModule, 'hasAdminEditOverrideForUser').mockReturnValue(true);
    vi.spyOn(flightPlanMembersModule, 'loadMembershipWithOwnerFallback').mockResolvedValue(null);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit invitee lookup without mission membership', async () => {
    payload.find.mockResolvedValue({
      docs: [
        {
          id: 91,
          callSign: 'Crew Neo',
          profileSlug: 'crew-neo',
          role: 'seamen',
        },
      ],
    });

    const response = await GET(createRequest('CREW'), {
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
    expect(flightPlanMembersModule.loadMembershipWithOwnerFallback).not.toHaveBeenCalled();
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        limit: 5,
      }),
    );
    expect(body.results).toEqual([
      {
        id: 91,
        callSign: 'Crew Neo',
        profileSlug: 'crew-neo',
        role: 'seamen',
      },
    ]);
  });

  it('keeps denying non-members when captain admin-edit override is disabled', async () => {
    vi.spyOn(flightPlanMembersModule, 'hasAdminEditOverrideForUser').mockReturnValueOnce(false);
    vi.spyOn(flightPlanMembersModule, 'loadMembershipWithOwnerFallback').mockResolvedValueOnce(null);

    const response = await GET(createRequest('crew'), {
      params: Promise.resolve({ slug: 'demo' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Only the captain or crew organisers can search for invitees unless captain admin edit mode is enabled.',
    });
    expect(payload.find).not.toHaveBeenCalled();
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

    const response = await GET(createRequest('crew'), {
      params: Promise.resolve({ slug: 'demo' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      error: 'Only the captain or crew organisers can search for invitees unless captain admin edit mode is enabled.',
    });
    expect(payload.find).not.toHaveBeenCalled();
  });
});
