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
    membershipIsAcceptedPassenger: vi.fn(() => false),
  };
});

vi.mock('@/app/api/_lib/flightPlanTasks', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/flightPlanTasks')>(
    '@/app/api/_lib/flightPlanTasks',
  );
  return {
    ...actual,
    loadTaskById: vi.fn(),
    ensureCrewMembershipForPlan: vi.fn(() => true),
    membershipMatchesFlightPlan: vi.fn(() => true),
  };
});

vi.mock('@/app/api/flight-plans/[slug]/tasks/helpers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/flight-plans/[slug]/tasks/helpers')>(
    '@/app/api/flight-plans/[slug]/tasks/helpers',
  );
  return {
    ...actual,
    ensureViewerMembership: vi.fn(),
  };
});

vi.mock('@/app/api/_lib/flightPlanTaskEvents', () => ({
  createTaskEvent: vi.fn((event: any) => event),
  publishTaskEvent: vi.fn(),
}));

import { DELETE } from '@/app/api/flight-plans/[slug]/tasks/[taskId]/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import { resolveFlightPlanBySlug } from '@/app/api/_lib/flightPlanMembers';
import { loadTaskById } from '@/app/api/_lib/flightPlanTasks';
import { ensureViewerMembership } from '@/app/api/flight-plans/[slug]/tasks/helpers';
import { publishTaskEvent } from '@/app/api/_lib/flightPlanTaskEvents';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedResolveFlightPlanBySlug = vi.mocked(resolveFlightPlanBySlug);
const mockedLoadTaskById = vi.mocked(loadTaskById);
const mockedEnsureViewerMembership = vi.mocked(ensureViewerMembership);
const mockedPublishTaskEvent = vi.mocked(publishTaskEvent);

const makeRequest = () =>
  ({
    headers: new Headers(),
  }) as unknown as NextRequest;

describe('DELETE /api/flight-plans/:slug/tasks/:taskId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit override for contributor-style crew memberships', async () => {
    const payload = {
      delete: vi.fn().mockResolvedValue(undefined),
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
      publicContributions: true,
      passengersCanCreateTasks: false,
    } as any);
    mockedLoadTaskById.mockResolvedValue({
      id: 900,
      flightPlanId: 44,
      ownerMembershipId: 222,
      version: 3,
      state: 'todo',
    } as any);
    mockedEnsureViewerMembership.mockResolvedValue({
      membership: {
        id: 111,
        flightPlanId: 44,
        userId: 77,
        role: 'crew',
        status: 'accepted',
        invitedById: 77,
        invitedAt: '2025-01-01T00:00:00.000Z',
        respondedAt: '2025-01-01T00:00:00.000Z',
      },
    } as any);

    const response = await DELETE(makeRequest(), {
      params: Promise.resolve({ slug: 'demo', taskId: '900' }),
    });

    expect(response.status).toBe(204);
    expect(payload.delete).toHaveBeenCalledWith({
      collection: 'flight-plan-tasks',
      id: 900,
      overrideAccess: true,
    });
    expect(mockedPublishTaskEvent).toHaveBeenCalled();
  });

  it('keeps denying non-captains with spoofed admin toggles', async () => {
    const payload = {
      delete: vi.fn().mockResolvedValue(undefined),
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
      publicContributions: false,
      passengersCanCreateTasks: false,
    } as any);
    mockedLoadTaskById.mockResolvedValue({
      id: 900,
      flightPlanId: 44,
      ownerMembershipId: 222,
      version: 3,
      state: 'todo',
    } as any);
    mockedEnsureViewerMembership.mockResolvedValue({
      response: new Response(
        JSON.stringify({ error: 'Crew access required.' }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      ),
    } as any);

    const response = await DELETE(makeRequest(), {
      params: Promise.resolve({ slug: 'demo', taskId: '900' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Crew access required.' });
    expect(payload.delete).not.toHaveBeenCalled();
    expect(mockedPublishTaskEvent).not.toHaveBeenCalled();
  });
});
