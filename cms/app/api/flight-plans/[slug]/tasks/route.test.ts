import { describe, expect, it, beforeEach, vi, afterEach, type Mock } from 'vitest';

import { GET, POST } from './route';
import { PATCH, DELETE } from './[taskId]/route';
import * as authModule from '@/app/api/_lib/auth';
import * as membersModule from '@/app/api/_lib/flightPlanMembers';
import * as tasksModule from '@/app/api/_lib/flightPlanTasks';
import type { FlightPlanMembershipRecord } from '@/app/api/_lib/flightPlanMembers';
import type { FlightPlanTaskRecord } from '@/app/api/_lib/flightPlanTasks';

vi.mock('@/src/services/notifications/flightPlans', () => ({
  notifyFlightPlanTaskAssignment: vi.fn(),
  notifyFlightPlanTaskOwnerChange: vi.fn(),
}));

type MockedAuth = Awaited<ReturnType<typeof authModule.authenticateRequest>>;

const createJsonRequest = (method: string, body?: Record<string, unknown>) => {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new Request('https://example.com/api/flight-plans/demo/tasks', init) as unknown as any;
};

const makeMembershipRecord = (
  overrides: Partial<FlightPlanMembershipRecord> = {},
): FlightPlanMembershipRecord => ({
  id: 5,
  flightPlanId: 77,
  userId: 101,
  role: overrides.role ?? 'crew',
  status: overrides.status ?? 'accepted',
  invitedById: null,
  invitedAt: null,
  respondedAt: null,
  ...overrides,
});

const makeTaskRecord = (overrides: Partial<FlightPlanTaskRecord> = {}): FlightPlanTaskRecord => ({
  id: 99,
  flightPlanId: 77,
  ownerMembershipId: 5,
  title: 'Sample task',
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

describe('flight plan task routes', () => {
  let mockAuth: MockedAuth;
  let payload: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    payload = {
      create: vi.fn().mockResolvedValue({ id: 200 }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      find: vi.fn(),
      findByID: vi.fn(),
      logger: {
        error: vi.fn(),
        warn: vi.fn(),
      },
    };
    mockAuth = {
      user: { id: 42 } as any,
      payload,
      adminMode: {
        adminViewEnabled: false,
        adminEditEnabled: false,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: false,
        },
      },
    };
    vi.spyOn(authModule, 'authenticateRequest').mockResolvedValue(mockAuth);
    vi.spyOn(membersModule, 'resolveFlightPlanBySlug').mockResolvedValue({
      id: 77,
      owner: 11,
      title: 'Mission Demo',
    } as any);
    vi.spyOn(membersModule, 'loadMembershipWithOwnerFallback').mockResolvedValue(
      makeMembershipRecord(),
    );
    vi.spyOn(membersModule, 'ensureCrewMembership').mockResolvedValue(makeMembershipRecord());
    vi.spyOn(membersModule, 'ensureOwnerMembership').mockResolvedValue(
      makeMembershipRecord({ id: 9, userId: 11, role: 'owner' }),
    );
    vi.spyOn(membersModule, 'loadMembershipsByIds').mockResolvedValue(
      new Map<number, FlightPlanMembershipRecord>([[5, makeMembershipRecord()]]),
    );
    vi.spyOn(tasksModule, 'listTasksForFlightPlan').mockResolvedValue([
      makeTaskRecord({ title: 'Guest ready' }),
    ]);
    vi.spyOn(tasksModule, 'buildMembershipSummaryMap').mockResolvedValue({
      membershipMap: new Map<number, FlightPlanMembershipRecord>([[5, makeMembershipRecord()]]),
      summaryByMembership: new Map(),
    });
    vi.spyOn(tasksModule, 'filterCrewAssignableMemberships').mockImplementation(
      (_, ids: number[]) => ids,
    );
    vi.spyOn(tasksModule, 'ensureCrewMembershipForPlan').mockReturnValue(true as any);
    vi.spyOn(tasksModule, 'loadTaskById').mockResolvedValue(makeTaskRecord());
    vi.spyOn(tasksModule, 'serializeTask').mockImplementation((task: any) => task);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('allows guest memberships to read tasks but blocks writes', async () => {
    (membersModule.loadMembershipWithOwnerFallback as Mock).mockResolvedValue(
      makeMembershipRecord({ role: 'guest' }),
    );

    const getResponse = await GET(createJsonRequest('GET'), { params: Promise.resolve({ slug: 'demo' }) });
    expect(getResponse.status).toBe(200);
    const payloadJson = await getResponse.json();
    expect(payloadJson.tasks).toHaveLength(1);
    expect(payloadJson.tasks[0].title).toBe('Guest ready');

    const postResponse = await POST(
      createJsonRequest('POST', { title: 'Blocked', state: 'ready' }),
      { params: Promise.resolve({ slug: 'demo' }) },
    );
    expect(postResponse.status).toBe(403);
    const error = await postResponse.json();
    expect(error.error).toContain('captains or crew organisers');
  });

  it('prevents non-owners from reassigning ownership or deleting tasks', async () => {
    (membersModule.loadMembershipWithOwnerFallback as Mock).mockResolvedValue(
      makeMembershipRecord({ id: 8, userId: 303 }),
    );
    (tasksModule.loadTaskById as Mock).mockResolvedValue(
      makeTaskRecord({ ownerMembershipId: 5, assigneeMembershipIds: [] }),
    );

    const patchResponse = (await PATCH(
      createJsonRequest('PATCH', { ownerMembershipId: 9 }),
      { params: Promise.resolve({ slug: 'demo', taskId: '99' }) },
    )) as Response;
    expect(patchResponse.status).toBe(403);
    const patchError = await patchResponse.json();
    expect(patchError.error).toContain('current task owner');

    const deleteResponse = (await DELETE(createJsonRequest('DELETE'), {
      params: Promise.resolve({ slug: 'demo', taskId: '99' }),
    })) as Response;
    expect(deleteResponse.status).toBe(403);
    const deleteError = await deleteResponse.json();
    expect(deleteError.error).toContain('Only captains or task owners');
  });

  it('filters invalid assignee ids when creating tasks', async () => {
    (membersModule.loadMembershipWithOwnerFallback as Mock).mockResolvedValue(
      makeMembershipRecord({ id: 12, userId: 500 }),
    );
    const membershipMap = new Map([
      [
        12,
        makeMembershipRecord({ id: 12, userId: 500 }),
      ],
      [
        55,
        makeMembershipRecord({ id: 55, userId: 600 }),
      ],
    ]);
    (tasksModule.buildMembershipSummaryMap as Mock).mockResolvedValue({
      membershipMap,
      summaryByMembership: new Map(),
    });
    (tasksModule.loadTaskById as Mock).mockResolvedValue(
      makeTaskRecord({ assigneeMembershipIds: [55] }),
    );
    (tasksModule.filterCrewAssignableMemberships as Mock).mockImplementation(
      (_: Map<number, FlightPlanMembershipRecord>, ids: number[]) => ids.filter((id) => id === 55),
    );

    const postResponse = await POST(
      createJsonRequest('POST', {
        title: 'Assign crew',
        assigneeMembershipIds: ['55', 'invalid', 72],
        state: 'ready',
      }),
      { params: Promise.resolve({ slug: 'demo' }) },
    );
    expect(postResponse.status).toBe(201);

    const taskCreateCall = payload.create.mock.calls.find(
      (call: any[]) => call[0]?.collection === 'flight-plan-tasks',
    );
    expect(taskCreateCall).toBeTruthy();
    expect(taskCreateCall?.[0].data.assigneeMembershipIds).toEqual([55]);
  });

  it('allows contributors on public missions to claim and unclaim tasks', async () => {
    (membersModule.resolveFlightPlanBySlug as Mock).mockResolvedValue({
      id: 77,
      owner: 11,
      title: 'Mission Demo',
      publicContributions: true,
    } as any);
    (membersModule.loadMembershipWithOwnerFallback as Mock).mockResolvedValue(null);
    (membersModule.ensureCrewMembership as Mock).mockResolvedValue(
      makeMembershipRecord({ id: 33, userId: 42 }),
    );
    (membersModule.ensureOwnerMembership as Mock).mockResolvedValue(
      makeMembershipRecord({ id: 9, userId: 11, role: 'owner' }),
    );
    (membersModule.loadMembershipsByIds as Mock).mockImplementation(
      async (_payload, ids: number[]) =>
        new Map<number, FlightPlanMembershipRecord>(
          ids.map((id) => [
            id,
            id === 9
              ? makeMembershipRecord({ id: 9, userId: 11, role: 'owner' })
              : makeMembershipRecord({ id, userId: 42 }),
          ]),
        ),
    );
    (tasksModule.loadTaskById as Mock).mockResolvedValue(
      makeTaskRecord({ ownerMembershipId: 5, assigneeMembershipIds: [] }),
    );
    (tasksModule.buildMembershipSummaryMap as Mock).mockResolvedValue({
      membershipMap: new Map<number, FlightPlanMembershipRecord>([
        [33, makeMembershipRecord({ id: 33, userId: 42 })],
        [9, makeMembershipRecord({ id: 9, userId: 11, role: 'owner' })],
      ]),
      summaryByMembership: new Map(),
    });

    const claimResponse = (await PATCH(
      createJsonRequest('PATCH', { action: 'claim' }),
      { params: Promise.resolve({ slug: 'demo', taskId: '99' }) },
    )) as Response;
    expect(claimResponse.status).toBe(200);
    const claimUpdate = payload.update.mock.calls.find(
      (call: any[]) => call[0]?.collection === 'flight-plan-tasks',
    );
    expect(claimUpdate?.[0].data.ownerMembership).toBe(33);

    (tasksModule.loadTaskById as Mock).mockResolvedValueOnce(
      makeTaskRecord({ ownerMembershipId: 33, assigneeMembershipIds: [33] }),
    );
    (tasksModule.buildMembershipSummaryMap as Mock).mockResolvedValueOnce({
      membershipMap: new Map<number, FlightPlanMembershipRecord>([
        [33, makeMembershipRecord({ id: 33, userId: 42 })],
        [9, makeMembershipRecord({ id: 9, userId: 11, role: 'owner' })],
      ]),
      summaryByMembership: new Map(),
    });

    const unclaimResponse = (await PATCH(
      createJsonRequest('PATCH', { action: 'unclaim' }),
      { params: Promise.resolve({ slug: 'demo', taskId: '99' }) },
    )) as Response;
    expect(unclaimResponse.status).toBe(200);
    const unclaimUpdate = payload.update.mock.calls
      .slice()
      .reverse()
      .find(
      (call: any[]) => call[0]?.collection === 'flight-plan-tasks',
      );
    expect(unclaimUpdate?.[0].data.ownerMembership).toBe(9);
  });
});
