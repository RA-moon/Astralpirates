import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/api/_lib/flightPlanMembers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/flightPlanMembers')>(
    '@/app/api/_lib/flightPlanMembers',
  );
  return {
    ...actual,
    loadMembershipWithOwnerFallback: vi.fn(),
    ensureCrewMembership: vi.fn(),
  };
});

import { resolveMediaModifyAccess } from '@/app/api/_lib/mediaAccess';
import {
  ensureCrewMembership,
  loadMembershipWithOwnerFallback,
} from '@/app/api/_lib/flightPlanMembers';

const mockedLoadMembershipWithOwnerFallback = vi.mocked(loadMembershipWithOwnerFallback);
const mockedEnsureCrewMembership = vi.mocked(ensureCrewMembership);

const basePayload = () =>
  ({
    find: vi.fn(),
    findByID: vi.fn(),
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
    },
  }) as any;

describe('resolveMediaModifyAccess task-attachment admin-edit behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit override without pre-existing mission membership', async () => {
    const payload = basePayload();
    mockedLoadMembershipWithOwnerFallback.mockResolvedValueOnce(null as any);
    mockedEnsureCrewMembership.mockResolvedValueOnce({
      id: 222,
      flightPlanId: 44,
      userId: 77,
      role: 'crew',
      status: 'accepted',
      invitedById: 12,
      invitedAt: '2026-04-10T00:00:00.000Z',
      respondedAt: '2026-04-10T00:00:00.000Z',
    } as any);

    const result = await resolveMediaModifyAccess({
      scope: 'task-attachment',
      payload,
      user: { id: 77, role: 'captain' },
      action: 'upload',
      flightPlanId: 44,
      ownerIdHint: 12,
      passengersCanCreateTasks: false,
      isCrewOnly: false,
      taskOwnerMembershipId: null,
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    });

    expect(result).toEqual({
      allow: true,
      membership: {
        id: 222,
        role: 'crew',
      },
    });
    expect(mockedEnsureCrewMembership).toHaveBeenCalledWith({
      payload,
      flightPlanId: 44,
      userId: 77,
      inviterId: 12,
    });
  });

  it('keeps denying non-captains even when admin toggles are spoofed on', async () => {
    const payload = basePayload();
    mockedLoadMembershipWithOwnerFallback.mockResolvedValueOnce(null as any);

    const result = await resolveMediaModifyAccess({
      scope: 'task-attachment',
      payload,
      user: { id: 88, role: 'seamen' },
      action: 'upload',
      flightPlanId: 44,
      ownerIdHint: 12,
      passengersCanCreateTasks: false,
      isCrewOnly: false,
      taskOwnerMembershipId: null,
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: false,
          canUseAdminEdit: false,
        },
      },
    });

    expect(result).toEqual({
      allow: false,
      status: 403,
      error: 'Crew access required.',
    });
    expect(mockedEnsureCrewMembership).not.toHaveBeenCalled();
  });
});
