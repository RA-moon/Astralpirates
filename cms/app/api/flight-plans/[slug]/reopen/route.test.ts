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
  return new Request('https://example.com/api/flight-plans/demo/reopen', init) as unknown as any;
};

describe('POST /api/flight-plans/:slug/reopen', () => {
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

  it('rejects non-reopenable statuses', async () => {
    payload.find.mockResolvedValue({
      docs: [{ id: 77, slug: 'demo', owner: 11, status: 'success' }],
    });

    const response = await POST(
      createRequest({
        statusReason: 'Reopening success should fail because it is final by policy.',
      }),
      {
        params: Promise.resolve({ slug: 'demo' }),
      },
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Only failure, aborted, cancelled missions can be reopened.',
    });
  });

  it('requires a reason on reopen', async () => {
    payload.find.mockResolvedValue({
      docs: [{ id: 77, slug: 'demo', owner: 11, status: 'failure' }],
    });

    const response = await POST(createRequest({ statusReason: 'too short' }), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'statusReason must be at least 12 characters.',
    });
  });

  it('does not allow spoofed admin toggles for non-captain reopen writes', async () => {
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
      docs: [{ id: 77, slug: 'demo', owner: 12, status: 'failure' }],
    });

    const response = await POST(
      createRequest({
        statusReason: 'Attempting reopen with spoofed toggles should still be denied.',
      }),
      {
        params: Promise.resolve({ slug: 'demo' }),
      },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Only the captain or sailing-master+ can reopen missions.',
    });
    expect(payload.update).not.toHaveBeenCalled();
  });

  it('reopens into pending and emits a reopen event', async () => {
    payload.find.mockResolvedValue({
      docs: [
        {
          id: 77,
          slug: 'demo',
          owner: 11,
          status: 'aborted',
          startedAt: null,
          finishedAt: null,
          visibility: 'crew',
          accessPolicy: { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'crew' },
          mediaVisibility: 'inherit',
          crewCanPromotePassengers: false,
          passengersCanCreateTasks: false,
          passengersCanCommentOnTasks: false,
          isPublic: false,
          publicContributions: false,
        },
      ],
    });
    payload.update.mockResolvedValue({
      id: 77,
      slug: 'demo',
      owner: 11,
      status: 'pending',
      statusChangedAt: '2026-04-01T10:30:00.000Z',
    });
    payload.create.mockResolvedValue({ id: 600 });

    const response = await POST(
      createRequest({ statusReason: 'Reopening after fixing launch blocker and crew readiness checks.' }),
      {
        params: Promise.resolve({ slug: 'demo' }),
      },
    );

    expect(response.status).toBe(200);

    const updateCall = payload.update.mock.calls[0]?.[0];
    expect(updateCall.collection).toBe('flight-plans');
    expect(updateCall.id).toBe(77);
    expect(updateCall.data.status).toBe('pending');
    expect(updateCall.data.visibility).toBe('crew');
    expect(updateCall.data.accessPolicy).toEqual({
      mode: 'role',
      roleSpace: 'flight-plan',
      minimumRole: 'crew',
    });
    expect(updateCall.data.isPublic).toBe(false);
    expect(updateCall.data.publicContributions).toBe(false);
    expect(updateCall.data.passengersCanCommentOnTasks).toBe(false);

    const eventCall = payload.create.mock.calls[0]?.[0];
    expect(eventCall.collection).toBe('flight-plan-status-events');
    expect(eventCall.data.fromStatus).toBe('aborted');
    expect(eventCall.data.toStatus).toBe('pending');
    expect(eventCall.data.actionType).toBe('reopen');
  });
});
