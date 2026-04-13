import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { usePasswordResetStore } from '~/stores/auth/passwordReset';

const requestFetchMock = vi.fn();

vi.mock('~/modules/api', () => ({
  getRequestFetch: () => requestFetchMock,
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
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('usePasswordResetStore', () => {
  it('sends a reset request and updates status', async () => {
    requestFetchMock.mockResolvedValueOnce({ message: 'Reset link sent.' });
    const store = usePasswordResetStore();

    await store.requestReset({
      firstName: 'Nova',
      lastName: 'Star',
      callSign: 'Nova',
      email: 'nova@example.com',
    });

    expect(requestFetchMock).toHaveBeenCalledWith(
      '/api/password-resets',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({
          firstName: 'Nova',
          callSign: 'Nova',
        }),
      }),
    );
    expect(store.status).toBe('success');
    expect(store.message).toBe('Reset link sent.');
  });

  it('throttles repeat submissions within the cooldown window', async () => {
    requestFetchMock.mockResolvedValueOnce({ message: 'Reset link sent.' });
    const store = usePasswordResetStore();
    await store.requestReset({
      firstName: 'Nova',
      lastName: 'Star',
      callSign: 'Nova',
      email: 'nova@example.com',
    });

    await expect(
      store.requestReset({
        firstName: 'Nova',
        lastName: 'Star',
        callSign: 'Nova',
        email: 'nova@example.com',
      }),
    ).rejects.toThrow(/Please wait/);
    expect(store.status).toBe('error');
    expect(store.error).toMatch(/Please wait/);
  });
});
