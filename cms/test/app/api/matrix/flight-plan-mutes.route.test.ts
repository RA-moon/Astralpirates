import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
  buildRequestForUser: vi.fn(),
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

import { PUT } from '@/app/api/matrix/flight-plan-mutes/route';
import { authenticateRequest, buildRequestForUser } from '@/app/api/_lib/auth';
import {
  hasAdminEditOverrideForUser,
  loadMembershipsForUser,
} from '@/app/api/_lib/flightPlanMembers';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedBuildRequestForUser = vi.mocked(buildRequestForUser);
const mockedHasAdminEditOverrideForUser = vi.mocked(hasAdminEditOverrideForUser);
const mockedLoadMembershipsForUser = vi.mocked(loadMembershipsForUser);

const makeRequest = (body: Record<string, unknown>) =>
  ({
    headers: new Headers(),
    nextUrl: new URL('https://astral.test/api/matrix/flight-plan-mutes'),
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as NextRequest;

describe('PUT /api/matrix/flight-plan-mutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit override without mission membership', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({ docs: [] }),
      create: vi.fn().mockResolvedValue({
        id: 99,
        flightPlan: 44,
        muted: true,
        mutedAt: '2026-04-10T00:00:00.000Z',
      }),
      logger: {
        error: vi.fn(),
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
    mockedHasAdminEditOverrideForUser.mockReturnValue(true);
    mockedLoadMembershipsForUser.mockResolvedValue([]);
    mockedBuildRequestForUser.mockResolvedValue({} as any);

    const response = await PUT(makeRequest({ flightPlanId: 44, muted: true }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockedHasAdminEditOverrideForUser).toHaveBeenCalledWith({
      userId: 77,
      websiteRole: 'captain',
      adminMode: expect.objectContaining({
        adminViewEnabled: true,
        adminEditEnabled: true,
      }),
    });
    expect(mockedLoadMembershipsForUser).toHaveBeenCalledWith({
      payload,
      userId: 77,
      acceptedOnly: true,
    });
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'matrix-flight-plan-mutes',
        data: expect.objectContaining({
          recordKey: '77:44',
          user: 77,
          flightPlan: 44,
          muted: true,
        }),
      }),
    );
    expect(body.flightPlanId).toBe(44);
    expect(body.muted).toBe(true);
  });

  it('keeps denying non-members without captain admin-edit override', async () => {
    const payload = {
      find: vi.fn(),
      create: vi.fn(),
      logger: {
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 11, role: 'crew' },
      adminMode: {
        adminViewEnabled: false,
        adminEditEnabled: false,
        eligibility: {
          canUseAdminView: false,
          canUseAdminEdit: false,
        },
      },
    } as any);
    mockedHasAdminEditOverrideForUser.mockReturnValue(false);
    mockedLoadMembershipsForUser.mockResolvedValue([]);

    const response = await PUT(makeRequest({ flightPlanId: 44, muted: true }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Not a member of this flight plan.');
    expect(payload.find).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
  });

  it('keeps denying non-captains with spoofed admin toggles', async () => {
    const payload = {
      find: vi.fn(),
      create: vi.fn(),
      logger: {
        error: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 21, role: 'seamen' },
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
    mockedLoadMembershipsForUser.mockResolvedValue([]);

    const response = await PUT(makeRequest({ flightPlanId: 44, muted: true }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe('Not a member of this flight plan.');
    expect(payload.find).not.toHaveBeenCalled();
    expect(payload.create).not.toHaveBeenCalled();
  });
});
