import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/api/_lib/flightPlanTasks', () => ({
  loadTaskById: vi.fn(),
}));

vi.mock('@/app/api/_lib/flightPlanMembers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/flightPlanMembers')>(
    '@/app/api/_lib/flightPlanMembers',
  );
  return {
    ...actual,
    loadFlightPlanSummary: vi.fn(),
  };
});

import { resolveCommentMentions } from '@/app/api/_lib/comments/mentions';
import { loadTaskById } from '@/app/api/_lib/flightPlanTasks';
import { loadFlightPlanSummary } from '@/app/api/_lib/flightPlanMembers';

const mockedLoadTaskById = vi.mocked(loadTaskById);
const mockedLoadFlightPlanSummary = vi.mocked(loadFlightPlanSummary);

describe('resolveCommentMentions', () => {
  const payload = {
    find: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoadTaskById.mockResolvedValue({
      id: 5,
      flightPlanId: 44,
      title: 'Task 5',
      version: 3,
      isCrewOnly: false,
    } as any);
    mockedLoadFlightPlanSummary.mockResolvedValue({
      id: 44,
      slug: 'mission-44',
      title: 'Mission 44',
      path: '/bridge/flight-plans/mission-44',
    });
    payload.find.mockResolvedValue({
      docs: [
        {
          id: 101,
          user: {
            id: 201,
            callSign: 'alpha',
            profileSlug: 'crew-alpha',
          },
        },
        {
          id: 102,
          user: {
            id: 202,
            callSign: 'beta',
            profileSlug: 'crew-beta',
          },
        },
      ],
    });
  });

  it('merges explicit mentions with parsed @handle mentions', async () => {
    const result = await resolveCommentMentions({
      payload: payload as any,
      thread: {
        id: 1,
        resourceType: 'flight-plan-task',
        resourceId: 5,
        createdById: 99,
        locked: false,
        pinned: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      rawBody: 'Need review from @alpha and @crew-beta',
      rawMentionMembershipIds: [102],
    });

    expect(result.mentionMembershipIds).toEqual([101, 102]);
    expect(result.mentionUserIds).toEqual([201, 202]);
    expect(result.taskId).toBe(5);
    expect(result.taskVersion).toBe(3);
    expect(result.taskIsCrewOnly).toBe(false);
    expect(result.flightPlanId).toBe(44);
    expect(result.planSlug).toBe('mission-44');
  });

  it('ignores mentions for non-task resources', async () => {
    const result = await resolveCommentMentions({
      payload: payload as any,
      thread: {
        id: 1,
        resourceType: 'unknown-resource',
        resourceId: 5,
        createdById: 99,
        locked: false,
        pinned: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      rawBody: '@alpha',
      rawMentionMembershipIds: [101],
    });

    expect(result.mentionMembershipIds).toEqual([]);
    expect(result.mentionUserIds).toEqual([]);
    expect(result.taskVersion).toBeNull();
    expect(result.taskIsCrewOnly).toBeNull();
    expect(payload.find).not.toHaveBeenCalled();
  });

  it('drops ambiguous @handle matches', async () => {
    payload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 101,
          user: {
            id: 201,
            callSign: 'alpha',
            profileSlug: 'alpha-one',
          },
        },
        {
          id: 102,
          user: {
            id: 202,
            callSign: 'alpha',
            profileSlug: 'alpha-two',
          },
        },
      ],
    });

    const result = await resolveCommentMentions({
      payload: payload as any,
      thread: {
        id: 1,
        resourceType: 'flight-plan-task',
        resourceId: 5,
        createdById: 99,
        locked: false,
        pinned: false,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
      rawBody: 'Ping @alpha',
      rawMentionMembershipIds: [],
    });

    expect(result.mentionMembershipIds).toEqual([]);
    expect(result.mentionUserIds).toEqual([]);
  });
});
