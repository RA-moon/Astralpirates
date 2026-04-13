import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import * as authModule from '@/app/api/_lib/auth';
import * as contentModule from '@/app/api/_lib/content';

type MockedAuth = Awaited<ReturnType<typeof authModule.authenticateRequest>>;

const createRequest = (body?: Record<string, unknown>) => {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new Request('https://example.com/api/flight-plans/demo/status', init) as unknown as any;
};

describe('POST /api/flight-plans/:slug/status', () => {
  let payload: any;
  let mockAuth: MockedAuth;

  beforeEach(() => {
    vi.restoreAllMocks();
    payload = {
      find: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockAuth = {
      user: { id: 11, role: 'captain' } as any,
      payload,
      adminMode: {
        adminViewEnabled: false,
        adminEditEnabled: false,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    };

    vi.spyOn(authModule, 'authenticateRequest').mockResolvedValue(mockAuth);
    vi.spyOn(authModule, 'buildRequestForUser').mockResolvedValue({} as any);
    vi.spyOn(contentModule, 'resolveOwners').mockResolvedValue(new Map());
    vi.spyOn(contentModule, 'sanitizeFlightPlan').mockImplementation((plan: any) => plan);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects users without lifecycle permission', async () => {
    mockAuth.user = { id: 99, role: 'seamen' } as any;
    payload.find.mockResolvedValue({
      docs: [{ id: 77, slug: 'demo', owner: 12, status: 'planned' }],
    });

    const response = await POST(createRequest({ status: 'pending' }), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Only the captain or sailing-master+ can update mission lifecycle status.',
    });
  });

  it('does not allow spoofed admin toggles for non-captain lifecycle writes', async () => {
    mockAuth.user = { id: 99, role: 'seamen' } as any;
    mockAuth.adminMode = {
      adminViewEnabled: true,
      adminEditEnabled: true,
      eligibility: {
        canUseAdminView: false,
        canUseAdminEdit: false,
      },
    } as any;
    payload.find.mockResolvedValue({
      docs: [{ id: 77, slug: 'demo', owner: 12, status: 'planned' }],
    });

    const response = await POST(createRequest({ status: 'pending' }), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Only the captain or sailing-master+ can update mission lifecycle status.',
    });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it('rejects invalid transition requests', async () => {
    payload.find.mockResolvedValue({
      docs: [{ id: 77, slug: 'demo', owner: 11, status: 'success' }],
    });

    const response = await POST(createRequest({ status: 'pending' }), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Transition from success to pending is not allowed.',
    });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it('normalizes aliased statuses and persists status events', async () => {
    payload.find.mockResolvedValue({
      docs: [
        {
          id: 77,
          slug: 'demo',
          owner: 11,
          status: 'planned',
          startedAt: null,
          finishedAt: null,
          visibility: 'public',
          accessPolicy: { mode: 'public' },
          mediaVisibility: 'inherit',
          crewCanPromotePassengers: true,
          passengersCanCreateTasks: true,
          passengersCanCommentOnTasks: true,
          isPublic: true,
          publicContributions: true,
        },
      ],
    });
    payload.update.mockResolvedValue({
      id: 77,
      slug: 'demo',
      owner: 11,
      status: 'cancelled',
      statusChangedAt: '2026-04-01T10:15:00.000Z',
    });
    payload.create.mockResolvedValue({ id: 500 });

    const response = await POST(
      createRequest({
        status: 'canceled',
        statusReason: 'Cancelled due to severe weather and harbour closure.',
      }),
      {
        params: Promise.resolve({ slug: 'demo' }),
      },
    );

    expect(response.status).toBe(200);
    const updateCall = payload.update.mock.calls[0]?.[0];
    expect(updateCall.collection).toBe('flight-plans');
    expect(updateCall.id).toBe(77);
    expect(updateCall.data.status).toBe('cancelled');
    expect(updateCall.data.visibility).toBe('public');
    expect(updateCall.data.accessPolicy).toEqual({ mode: 'public' });
    expect(updateCall.data.isPublic).toBe(true);
    expect(updateCall.data.publicContributions).toBe(true);
    expect(updateCall.data.passengersCanCommentOnTasks).toBe(true);

    const eventCall = payload.create.mock.calls[0]?.[0];
    expect(eventCall.collection).toBe('flight-plan-status-events');
    expect(eventCall.data.flightPlan).toBe(77);
    expect(eventCall.data.fromStatus).toBe('planned');
    expect(eventCall.data.toStatus).toBe('cancelled');
    expect(eventCall.data.actionType).toBe('normalize');
  });
});
