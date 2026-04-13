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
    loadMembershipWithOwnerFallback: vi.fn(),
    membershipIsAcceptedCrew: vi.fn(),
    membershipIsAcceptedPassenger: vi.fn(),
  };
});

import { resolveCommentPolicy } from '@/app/api/_lib/comments/policies';
import { loadTaskById } from '@/app/api/_lib/flightPlanTasks';
import {
  loadMembershipWithOwnerFallback,
  membershipIsAcceptedCrew,
  membershipIsAcceptedPassenger,
} from '@/app/api/_lib/flightPlanMembers';

const mockedLoadTaskById = vi.mocked(loadTaskById);
const mockedLoadMembership = vi.mocked(loadMembershipWithOwnerFallback);
const mockedIsCrew = vi.mocked(membershipIsAcceptedCrew);
const mockedIsPassenger = vi.mocked(membershipIsAcceptedPassenger);

describe('resolveCommentPolicy', () => {
  const payload = {
    findByID: vi.fn(),
    logger: {
      warn: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoadTaskById.mockResolvedValue({
      id: 11,
      flightPlanId: 22,
      isCrewOnly: false,
    } as any);
    payload.findByID.mockResolvedValue({
      owner: 2,
      publicContributions: false,
      passengersCanCreateTasks: false,
      passengersCanCommentOnTasks: false,
      title: 'Test Mission',
      slug: 'test-mission',
    });
    mockedLoadMembership.mockResolvedValue({ id: 1 } as any);
  });

  it('grants crew moderation access', async () => {
    mockedIsCrew.mockReturnValueOnce(true);
    mockedIsPassenger.mockReturnValueOnce(false);

    const result = await resolveCommentPolicy({
      auth: { payload: payload as any, user: { id: 99 } },
      resourceType: 'flight-plan-task',
      resourceId: 11,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy.canComment).toBe(true);
      expect(result.policy.canVote).toBe(true);
      expect(result.policy.canModerate).toBe(true);
    }
  });

  it('blocks passenger comments by default but keeps read access', async () => {
    mockedIsCrew.mockReturnValueOnce(false);
    mockedIsPassenger.mockReturnValueOnce(true);

    const result = await resolveCommentPolicy({
      auth: { payload: payload as any, user: { id: 99 } },
      resourceType: 'flight-plan-task',
      resourceId: 11,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy.canComment).toBe(false);
      expect(result.policy.canVote).toBe(false);
      expect(result.policy.canModerate).toBe(false);
    }
  });

  it('allows passenger comments when passengersCanCommentOnTasks is enabled', async () => {
    mockedIsCrew.mockReturnValueOnce(false);
    mockedIsPassenger.mockReturnValueOnce(true);
    payload.findByID.mockResolvedValueOnce({
      owner: 2,
      publicContributions: false,
      passengersCanCreateTasks: false,
      passengersCanCommentOnTasks: true,
      title: 'Test Mission',
      slug: 'test-mission',
    });

    const result = await resolveCommentPolicy({
      auth: { payload: payload as any, user: { id: 99 } },
      resourceType: 'flight-plan-task',
      resourceId: 11,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy.canComment).toBe(true);
      expect(result.policy.canVote).toBe(true);
      expect(result.policy.canModerate).toBe(false);
    }
  });

  it('allows authenticated viewers when public contributions are enabled', async () => {
    mockedIsCrew.mockReturnValueOnce(false);
    mockedIsPassenger.mockReturnValueOnce(false);
    payload.findByID.mockResolvedValueOnce({
      owner: 2,
      publicContributions: true,
      passengersCanCreateTasks: false,
      passengersCanCommentOnTasks: false,
      title: 'Test Mission',
      slug: 'test-mission',
    });

    const result = await resolveCommentPolicy({
      auth: { payload: payload as any, user: { id: 99 } },
      resourceType: 'flight-plan-task',
      resourceId: 11,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy.canComment).toBe(false);
      expect(result.policy.canVote).toBe(false);
    }
  });

  it('rejects unauthenticated viewers without crew access', async () => {
    mockedIsCrew.mockReturnValueOnce(false);
    mockedIsPassenger.mockReturnValueOnce(false);
    payload.findByID.mockResolvedValueOnce({
      owner: 2,
      publicContributions: true,
      passengersCanCreateTasks: false,
      passengersCanCommentOnTasks: false,
      title: 'Test Mission',
      slug: 'test-mission',
    });

    const result = await resolveCommentPolicy({
      auth: { payload: payload as any, user: null },
      resourceType: 'flight-plan-task',
      resourceId: 11,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  it('blocks non-crew viewers from crew-only task discussions', async () => {
    mockedLoadTaskById.mockResolvedValueOnce({
      id: 11,
      flightPlanId: 22,
      isCrewOnly: true,
    } as any);
    mockedIsCrew.mockReturnValueOnce(false);
    mockedIsPassenger.mockReturnValueOnce(true);
    payload.findByID.mockResolvedValueOnce({
      owner: 2,
      publicContributions: true,
      passengersCanCreateTasks: false,
      passengersCanCommentOnTasks: true,
      title: 'Test Mission',
      slug: 'test-mission',
    });

    const result = await resolveCommentPolicy({
      auth: { payload: payload as any, user: { id: 99 } },
      resourceType: 'flight-plan-task',
      resourceId: 11,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
    }
  });

  it('allows captain admin-edit override to moderate without accepted membership', async () => {
    mockedLoadMembership.mockResolvedValueOnce(null);
    mockedIsCrew.mockReturnValueOnce(false);
    mockedIsPassenger.mockReturnValueOnce(false);

    const result = await resolveCommentPolicy({
      auth: {
        payload: payload as any,
        user: { id: 99, role: 'captain' } as any,
        adminMode: {
          adminViewEnabled: true,
          adminEditEnabled: true,
          eligibility: {
            canUseAdminView: true,
            canUseAdminEdit: true,
          },
        },
      } as any,
      resourceType: 'flight-plan-task',
      resourceId: 11,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.policy.canView).toBe(true);
      expect(result.policy.canComment).toBe(true);
      expect(result.policy.canVote).toBe(true);
      expect(result.policy.canModerate).toBe(true);
    }
  });

  it('does not allow spoofed admin toggles for non-captain moderation', async () => {
    mockedLoadMembership.mockResolvedValueOnce(null);
    mockedIsCrew.mockReturnValueOnce(false);
    mockedIsPassenger.mockReturnValueOnce(false);

    const result = await resolveCommentPolicy({
      auth: {
        payload: payload as any,
        user: { id: 199, role: 'seamen' } as any,
        adminMode: {
          adminViewEnabled: true,
          adminEditEnabled: true,
          eligibility: {
            canUseAdminView: false,
            canUseAdminEdit: false,
          },
        },
      } as any,
      resourceType: 'flight-plan-task',
      resourceId: 11,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.error).toBe('Crew access required.');
    }
  });
});
