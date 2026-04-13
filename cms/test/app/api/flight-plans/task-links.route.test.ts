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
    ensureCrewMembership: vi.fn(),
    membershipIsAcceptedPassenger: vi.fn(() => false),
    membershipMatchesFlightPlan: vi.fn(() => true),
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
    buildMembershipSummaryMap: vi.fn(async () => new Map()),
    serializeTask: vi.fn((task: any) => ({ id: task.id, links: task.links ?? [] })),
  };
});

vi.mock('@/app/api/flight-plans/[slug]/tasks/helpers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/flight-plans/[slug]/tasks/helpers')>(
    '@/app/api/flight-plans/[slug]/tasks/helpers',
  );
  return {
    ...actual,
    parseRequestBody: vi.fn(async () => ({ url: 'https://example.com/resource', title: 'Docs' })),
  };
});

vi.mock('@/app/api/_lib/flightPlanTaskEvents', () => ({
  createTaskEvent: vi.fn((event: any) => event),
  publishTaskEvent: vi.fn(),
}));

import { POST } from '@/app/api/flight-plans/[slug]/tasks/[taskId]/links/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  ensureCrewMembership,
  loadMembershipWithOwnerFallback,
  resolveFlightPlanBySlug,
} from '@/app/api/_lib/flightPlanMembers';
import { loadTaskById } from '@/app/api/_lib/flightPlanTasks';
import { publishTaskEvent } from '@/app/api/_lib/flightPlanTaskEvents';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedResolveFlightPlanBySlug = vi.mocked(resolveFlightPlanBySlug);
const mockedLoadMembershipWithOwnerFallback = vi.mocked(loadMembershipWithOwnerFallback);
const mockedEnsureCrewMembership = vi.mocked(ensureCrewMembership);
const mockedLoadTaskById = vi.mocked(loadTaskById);
const mockedPublishTaskEvent = vi.mocked(publishTaskEvent);

const makeRequest = () =>
  ({
    headers: new Headers(),
    nextUrl: new URL('https://astral.test/api/flight-plans/demo/tasks/900/links'),
  }) as unknown as NextRequest;

describe('POST /api/flight-plans/:slug/tasks/:taskId/links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit override to add links without pre-existing membership', async () => {
    const payload = {
      update: vi.fn().mockResolvedValue(undefined),
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
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 44,
      owner: { id: 5 },
      publicContributions: false,
      passengersCanCreateTasks: false,
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue(null);
    mockedEnsureCrewMembership.mockResolvedValue({
      id: 111,
      flightPlanId: 44,
      userId: 77,
      role: 'crew',
      status: 'accepted',
      invitedById: 5,
      invitedAt: '2025-01-01T00:00:00.000Z',
      respondedAt: '2025-01-01T00:00:00.000Z',
    } as any);
    mockedLoadTaskById
      .mockResolvedValueOnce({
        id: 900,
        flightPlanId: 44,
        ownerMembershipId: 222,
        assigneeMembershipIds: [],
        links: [],
        isCrewOnly: false,
        version: 2,
      } as any)
      .mockResolvedValueOnce({
        id: 900,
        flightPlanId: 44,
        ownerMembershipId: 222,
        assigneeMembershipIds: [],
        links: [{ id: 'link-1', url: 'https://example.com/resource', title: 'Docs' }],
        isCrewOnly: false,
        version: 3,
      } as any);

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ slug: 'demo', taskId: '900' }),
    });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.link.url).toBe('https://example.com/resource');
    expect(mockedEnsureCrewMembership).toHaveBeenCalledWith({
      payload,
      flightPlanId: 44,
      userId: 77,
      inviterId: 5,
    });
    const updateCall = payload.update.mock.calls[0]?.[0];
    expect(updateCall.collection).toBe('flight-plan-tasks');
    expect(updateCall.id).toBe(900);
    expect(updateCall.data.version).toBe(3);
    expect(updateCall.data.links).toHaveLength(1);
    expect(updateCall.data.links[0].url).toBe('https://example.com/resource');
    expect(mockedPublishTaskEvent).toHaveBeenCalled();
  });

  it('keeps denying non-captains with spoofed admin toggles', async () => {
    const payload = {
      update: vi.fn().mockResolvedValue(undefined),
      logger: {
        error: vi.fn(),
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
      publicContributions: false,
      passengersCanCreateTasks: false,
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue(null);
    mockedLoadTaskById.mockResolvedValue({
      id: 900,
      flightPlanId: 44,
      ownerMembershipId: 222,
      assigneeMembershipIds: [],
      links: [],
      isCrewOnly: false,
      version: 2,
    } as any);

    const response = await POST(makeRequest(), {
      params: Promise.resolve({ slug: 'demo', taskId: '900' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Crew access required.' });
    expect(mockedEnsureCrewMembership).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
    expect(mockedPublishTaskEvent).not.toHaveBeenCalled();
  });
});
