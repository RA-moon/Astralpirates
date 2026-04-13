import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useActivityTracker } from '~/composables/useActivityTracker';

const logoutMock = vi.fn();
const requestFetchMock = vi.fn();
const stateMap = new Map<string, any>();
const routerAfterEachCallbacks: ((path: { fullPath: string }) => void)[] = [];
const router = {
  currentRoute: { value: { fullPath: '/bridge' } },
  afterEach(callback: (path: { fullPath: string }) => void) {
    routerAfterEachCallbacks.push(callback);
  },
};

vi.mock('~/modules/api', () => ({
  getRequestFetch: () => requestFetchMock,
}));

vi.mock('~/stores/session', () => ({
  useSessionStore: () => ({
    isAuthenticated: true,
    logout: logoutMock,
  }),
}));

vi.mock('#imports', () => ({
  useRouter: () => router,
  useState: (key: string, init: () => any) => {
    if (!stateMap.has(key)) {
      stateMap.set(key, ref(init()));
    }
    return stateMap.get(key);
  },
}));

const WARNING_MS = 150_000;
const LOGOUT_MS = 180_000;

describe('useActivityTracker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(process, { client: true, server: false, dev: false });
    requestFetchMock.mockReset();
    requestFetchMock.mockResolvedValue({ ok: true });
    logoutMock.mockReset();
    router.currentRoute.value = { fullPath: '/bridge' };
    routerAfterEachCallbacks.length = 0;
    stateMap.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a warning and then logs out after extended inactivity', async () => {
    const tracker = useActivityTracker();
    tracker.init();
    tracker.recordActivity({ forcePing: true });

    expect(tracker.warningVisible.value).toBe(false);

    await vi.advanceTimersByTimeAsync(WARNING_MS - 1_000);
    expect(tracker.warningVisible.value).toBe(false);
    expect(logoutMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(tracker.warningVisible.value).toBe(true);
    expect(tracker.countdown.value).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(LOGOUT_MS - WARNING_MS + 1_000);
    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(tracker.warningVisible.value).toBe(false);
  });
});
