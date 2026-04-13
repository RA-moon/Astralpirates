import { describe, expect, it, vi, beforeEach } from 'vitest';
import { effectScope, reactive } from 'vue';
import { fetchFlightPlanMembers } from '~/domains/flightPlans/api';
import { useFlightPlanCrew } from '~/domains/flightPlans';

const sessionStore = reactive({
  isAuthenticated: true,
  bearerToken: 'token',
  currentUser: { id: 101, profileSlug: 'captain' },
  refresh: vi.fn(),
});

vi.mock('~/stores/session', () => ({
  useSessionStore: () => sessionStore,
}));

vi.mock('~/domains/flightPlans/api', () => ({
  fetchFlightPlanMembers: vi.fn(),
  inviteFlightPlanMember: vi.fn(),
  searchFlightPlanInvitees: vi.fn(),
  promoteFlightPlanMember: vi.fn(),
  normaliseFlightPlanSlug: (value: string | null | undefined) =>
    typeof value === 'string' ? value.trim() || null : null,
}));

describe('useFlightPlanCrew', () => {
  beforeEach(() => {
    fetchFlightPlanMembers.mockReset();
    sessionStore.isAuthenticated = true;
    sessionStore.currentUser = { id: 101, profileSlug: 'captain' };
  });

  it('marks canInvite false when viewer is crew', async () => {
    fetchFlightPlanMembers.mockResolvedValue([
      {
        id: 1,
        flightPlanId: 77,
        userId: 55,
        role: 'owner',
        status: 'accepted',
        invitedAt: null,
        respondedAt: null,
        user: null,
        invitedBy: null,
      },
      {
        id: 2,
        flightPlanId: 77,
        userId: 101,
        role: 'crew',
        status: 'accepted',
        invitedAt: null,
        respondedAt: null,
        user: null,
        invitedBy: null,
      },
    ]);

    const scope = effectScope();
    const composable = scope.run(() => useFlightPlanCrew(() => 'mission'))!;
    await composable.loadMembers();

    expect(composable.viewerIsCrewOrganiser.value).toBe(true);
    expect(composable.canInvite.value).toBe(false);

    scope.stop();
  });

  it('allows invites when viewer is the owner', async () => {
    sessionStore.currentUser = { id: 55, profileSlug: 'captain' };
    fetchFlightPlanMembers.mockResolvedValue([
      {
        id: 1,
        flightPlanId: 77,
        userId: 55,
        role: 'owner',
        status: 'accepted',
        invitedAt: null,
        respondedAt: null,
        user: null,
        invitedBy: null,
      },
    ]);

    const scope = effectScope();
    const composable = scope.run(() => useFlightPlanCrew(() => 'mission'))!;
    await composable.loadMembers();

    expect(composable.viewerIsOwner.value).toBe(true);
    expect(composable.canInvite.value).toBe(true);

    scope.stop();
  });

  it('loads roster when plan is public and viewer is logged out', async () => {
    sessionStore.isAuthenticated = false;
    (sessionStore as any).currentUser = null;
    fetchFlightPlanMembers.mockResolvedValue([
      {
        id: 1,
        flightPlanId: 77,
        userId: 55,
        role: 'owner',
        status: 'accepted',
        invitedAt: null,
        respondedAt: null,
        user: null,
        invitedBy: null,
      },
    ]);

    const scope = effectScope();
    const composable = scope.run(() =>
      useFlightPlanCrew(() => 'mission', { allowPublicRoster: () => true }),
    )!;
    await composable.loadMembers();

    expect(fetchFlightPlanMembers).toHaveBeenCalled();
    expect(composable.members.value).toHaveLength(1);

    scope.stop();
  });
});
