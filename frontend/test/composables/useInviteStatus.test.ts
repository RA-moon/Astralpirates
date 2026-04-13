import { describe, expect, it, beforeEach, vi, afterAll } from 'vitest';
import { reactive, toRef, nextTick } from 'vue';

const createInvitationsStore = () => {
  const store = reactive({
    invite: null as any,
    elsaTokens: 0,
    status: 'idle',
    error: null as string | null,
    lastFetchedAt: null as string | null,
    fetchStatus: vi.fn(async () => {
      store.lastFetchedAt = new Date().toISOString();
    }),
    reset: vi.fn(() => {
      store.invite = null;
      store.elsaTokens = 0;
      store.status = 'idle';
      store.error = null;
      store.lastFetchedAt = null;
    }),
    cancelInvite: vi.fn(async () => ({ message: 'cancelled' })),
    requestInvite: vi.fn(async () => {}),
  });
  return store;
};

const invitationsStore = createInvitationsStore();
const sessionStore = reactive({
  isAuthenticated: true,
  bearerToken: 'token',
});

vi.mock('pinia', () => ({
  storeToRefs: (store: any) => ({
    invite: toRef(store, 'invite'),
    elsaTokens: toRef(store, 'elsaTokens'),
    status: toRef(store, 'status'),
    error: toRef(store, 'error'),
  }),
}));

vi.mock('~/stores/invitations', () => ({
  useInvitationsStore: () => invitationsStore,
}));

vi.mock('~/stores/session', () => ({
  useSessionStore: () => sessionStore,
}));

describe('useInviteStatus', () => {
  let useInviteStatus: typeof import('~/composables/useInviteStatus').useInviteStatus;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    invitationsStore.fetchStatus.mockClear();
    invitationsStore.reset.mockClear();
    invitationsStore.fetchStatus.mockImplementation(async () => {
      invitationsStore.lastFetchedAt = new Date().toISOString();
    });
    invitationsStore.lastFetchedAt = null;
    invitationsStore.invite = null;
    vi.resetModules();
    ({ useInviteStatus } = await import('~/composables/useInviteStatus'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('skips hydration when cache is fresh', async () => {
    const { hydrateStatus } = useInviteStatus();
    invitationsStore.lastFetchedAt = new Date().toISOString();

    const result = await hydrateStatus();

    expect(result).toMatchObject({ ok: true });
    expect(invitationsStore.fetchStatus).not.toHaveBeenCalled();
  });

  it('hydrates when cache is stale', async () => {
    const { hydrateStatus } = useInviteStatus();
    invitationsStore.lastFetchedAt = new Date(Date.now() - 60_000).toISOString();

    const result = await hydrateStatus({ maxAgeMs: 1_000 });

    expect(result).toMatchObject({ ok: true });
    expect(invitationsStore.fetchStatus).toHaveBeenCalledTimes(1);
  });

  it('retries failed hydration attempts', async () => {
    const { hydrateStatus } = useInviteStatus();
    const error = new Error('network issue');
    invitationsStore.fetchStatus
      .mockRejectedValueOnce(error)
      .mockImplementationOnce(async () => {
        invitationsStore.lastFetchedAt = new Date().toISOString();
      });

    const result = await hydrateStatus({ retry: 1 });

    expect(invitationsStore.fetchStatus).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true });
  });

  it('treats redeemed invites as inactive', async () => {
    const { hasInvite, inviteEmail } = useInviteStatus();
    invitationsStore.invite = {
      email: 'recruit@example.com',
      redeemedAt: null,
    };
    await nextTick();

    expect(hasInvite.value).toBe(true);
    expect(inviteEmail.value).toBe('recruit@example.com');

    invitationsStore.invite = {
      ...(invitationsStore.invite as any),
      redeemedAt: new Date().toISOString(),
    };
    await nextTick();

    expect(hasInvite.value).toBe(false);
  });
});
