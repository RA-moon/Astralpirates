import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE, POST } from './route';
import * as authModule from '@/app/api/_lib/auth';
import * as membersModule from '@/app/api/_lib/flightPlanMembers';
import * as tasksModule from '@/app/api/_lib/flightPlanTasks';

type MockedAuth = Awaited<ReturnType<typeof authModule.authenticateRequest>>;

const makeMembership = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 33,
  flightPlanId: 77,
  userId: 42,
  role: 'crew',
  status: 'accepted',
  invitedById: null,
  invitedAt: null,
  respondedAt: null,
  ...overrides,
});

const makeTask = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 99,
  flightPlanId: 77,
  ownerMembershipId: 5,
  title: 'Task',
  description: [],
  state: 'ideation',
  listOrder: 1,
  assigneeMembershipIds: [],
  attachments: [],
  links: [],
  isCrewOnly: false,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const createPostRequest = (body: Record<string, unknown>) =>
  new Request('https://example.com/api/flight-plans/demo/tasks/99/links', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as any;

const createDeleteRequest = (linkId: string) =>
  ({
    method: 'DELETE',
    headers: new Headers(),
    nextUrl: new URL(
      `https://example.com/api/flight-plans/demo/tasks/99/links?linkId=${encodeURIComponent(linkId)}`,
    ),
    json: vi.fn().mockResolvedValue({}),
  }) as unknown as any;

const requireResponse = <T>(value: T | undefined): T => {
  expect(value).toBeDefined();
  if (value === undefined) {
    throw new Error('Route handler returned undefined response');
  }
  return value;
};

describe('task link routes god-mode coverage', () => {
  let payload: any;
  let mockAuth: MockedAuth;

  beforeEach(() => {
    vi.restoreAllMocks();
    payload = {
      update: vi.fn().mockResolvedValue({}),
      logger: {
        error: vi.fn(),
      },
    };
    mockAuth = {
      user: { id: 42, role: 'captain' } as any,
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
    vi.spyOn(membersModule, 'resolveFlightPlanBySlug').mockResolvedValue({
      id: 77,
      owner: 11,
      slug: 'demo',
      title: 'Demo Mission',
      publicContributions: false,
      passengersCanCreateTasks: false,
    } as any);
    vi.spyOn(membersModule, 'loadMembershipWithOwnerFallback').mockResolvedValue(null);
    vi.spyOn(membersModule, 'ensureCrewMembership').mockResolvedValue(makeMembership() as any);
    vi.spyOn(tasksModule, 'ensureCrewMembershipForPlan').mockReturnValue(true as any);
    vi.spyOn(tasksModule, 'loadTaskById').mockResolvedValue(makeTask() as any);
    vi.spyOn(tasksModule, 'buildMembershipSummaryMap').mockResolvedValue({
      membershipMap: new Map([[33, makeMembership()]]),
      summaryByMembership: new Map(),
    } as any);
    vi.spyOn(tasksModule, 'serializeTask').mockImplementation((task: any) => task);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit to add links without existing membership', async () => {
    const response = requireResponse(
      await POST(createPostRequest({ url: 'https://example.com/doc', title: 'Runbook' }), {
        params: Promise.resolve({ slug: 'demo', taskId: '99' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(membersModule.ensureCrewMembership).toHaveBeenCalledWith({
      payload,
      flightPlanId: 77,
      userId: 42,
      inviterId: 11,
    });
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'flight-plan-tasks',
        id: 99,
        data: expect.objectContaining({
          version: 2,
        }),
        overrideAccess: true,
      }),
    );
    expect(body.link).toEqual(
      expect.objectContaining({
        url: 'https://example.com/doc',
        title: 'Runbook',
        addedByMembershipId: 33,
      }),
    );
  });

  it('allows captain admin-edit to remove links without existing membership', async () => {
    const link = {
      id: 'link-1',
      url: 'https://example.com/doc',
      title: 'Runbook',
      addedByMembershipId: 5,
      addedAt: '2026-04-10T00:00:00.000Z',
    };
    (tasksModule.loadTaskById as any)
      .mockResolvedValueOnce(makeTask({ links: [link] }))
      .mockResolvedValueOnce(makeTask({ links: [], version: 2 }));

    const response = requireResponse(
      await DELETE(createDeleteRequest('link-1'), {
        params: Promise.resolve({ slug: 'demo', taskId: '99' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(membersModule.ensureCrewMembership).toHaveBeenCalledWith({
      payload,
      flightPlanId: 77,
      userId: 42,
      inviterId: 11,
    });
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'flight-plan-tasks',
        id: 99,
        data: expect.objectContaining({
          links: [],
          version: 2,
        }),
        overrideAccess: true,
      }),
    );
  });

  it('keeps denying non-members when admin-edit override is unavailable', async () => {
    mockAuth.user = { id: 88, role: 'seamen' } as any;
    mockAuth.adminMode = {
      adminViewEnabled: false,
      adminEditEnabled: false,
      eligibility: {
        canUseAdminView: false,
        canUseAdminEdit: false,
      },
    } as any;

    const response = requireResponse(
      await POST(createPostRequest({ url: 'https://example.com/doc' }), {
        params: Promise.resolve({ slug: 'demo', taskId: '99' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Crew access required.' });
    expect(membersModule.ensureCrewMembership).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
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

    const response = requireResponse(
      await POST(createPostRequest({ url: 'https://example.com/doc' }), {
        params: Promise.resolve({ slug: 'demo', taskId: '99' }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: 'Crew access required.' });
    expect(membersModule.ensureCrewMembership).not.toHaveBeenCalled();
    expect(payload.update).not.toHaveBeenCalled();
  });
});
