import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useInvitationsStore } from '~/stores/invitations';
import { useSessionStore } from '~/stores/session';

const requestFetchMock = vi.fn();

vi.mock('~/modules/api', () => ({
  getRequestFetch: () => requestFetchMock,
  useAstralFetch: vi.fn(),
}));

vi.mock('#app', () => ({
  useRuntimeConfig: () => ({
    astralApiBase: 'http://cms.test',
    public: { astralApiBase: 'http://cms.test' },
  }),
  createError: ({ statusCode, statusMessage }: { statusCode: number; statusMessage: string }) => {
    const error = new Error(statusMessage);
    (error as any).statusCode = statusCode;
    return error;
  },
}));

beforeAll(() => {
  Object.assign(process, { client: true, server: false, dev: true });
});

beforeEach(() => {
  setActivePinia(createPinia());
  requestFetchMock.mockReset();
});

describe('useInvitationsStore', () => {
  it('resets state when no access token is available', async () => {
    const session = useSessionStore();
    session.clearSession();

    const store = useInvitationsStore();
    store.status = 'loading';

    await expect(store.fetchStatus()).resolves.toBeNull();
    expect(store.status).toBe('idle');
    expect(store.invite).toBeNull();
    expect(store.elsaTokens).toBe(0);
  });

  it('fetches invite status for authenticated user', async () => {
    const session = useSessionStore();
    session.setSession({ token: 'token-123', user: { id: 5, email: 'crew@astralpirates.com' } });

    requestFetchMock.mockResolvedValue({
      invite: { email: 'friend@example.com' },
      elsaTokens: 4,
    });

    const store = useInvitationsStore();
    await store.fetchStatus();

    expect(requestFetchMock).toHaveBeenCalledWith(
      '/api/invitations',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
    expect(store.status).toBe('ready');
    expect(store.invite?.email).toBe('friend@example.com');
    expect(store.elsaTokens).toBe(4);
  });

  it('clears the session when invite fetch returns unauthorized', async () => {
    const session = useSessionStore();
    session.setSession({ token: 'expired', user: { id: 6, email: 'crew@astralpirates.com' } });

    const error = new Error('Unauthorized');
    (error as any).statusCode = 401;
    requestFetchMock.mockRejectedValue(error);

    const store = useInvitationsStore();
    await expect(store.fetchStatus({ silentUnauthorized: false })).rejects.toThrow();

    expect(session.status).toBe('unauthenticated');
    expect(store.status).toBe('error');
  });
});
