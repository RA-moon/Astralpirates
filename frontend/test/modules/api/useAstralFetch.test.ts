import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import { useAstralFetch } from '~/modules/api/useAstralFetch';

const sessionState = {
  bearerToken: 'session-token' as string | null,
};

vi.mock('~/stores/session', () => ({
  useSessionStore: () => sessionState,
}));

const useFetchMock = vi.fn();

const captureOnRequest = async (
  options: Parameters<typeof useAstralFetch>[1],
): Promise<(ctx: { options: { headers?: HeadersInit } }) => Promise<void>> => {
  useFetchMock.mockClear();
  useAstralFetch('/api/example', options);
  expect(useFetchMock).toHaveBeenCalledTimes(1);
  const [, callOptions] = useFetchMock.mock.calls[0] ?? [];
  const onRequest = callOptions?.onRequest;
  if (typeof onRequest !== 'function') {
    throw new Error('Expected onRequest hook to be defined');
  }
  return onRequest;
};

describe('useAstralFetch auth behavior', () => {
  beforeEach(() => {
    sessionState.bearerToken = 'session-token';
    useFetchMock.mockReset();
    (globalThis as any).__mockUseFetch = useFetchMock.mockImplementation(() => ({
      data: ref(undefined),
      pending: ref(false),
      error: ref(undefined),
    }));
  });

  it('attaches Authorization only when requiresAuth is true', async () => {
    const onRequest = await captureOnRequest({ requiresAuth: true });
    const ctx = { options: { headers: new Headers() } };

    await onRequest(ctx);

    expect(new Headers(ctx.options.headers).get('Authorization')).toBe('Bearer session-token');
  });

  it('throws 401 when requiresAuth is true and no token is available', async () => {
    sessionState.bearerToken = null;
    const onRequest = await captureOnRequest({ requiresAuth: true });
    const ctx = { options: { headers: new Headers() } };

    await expect(onRequest(ctx)).rejects.toMatchObject({ statusCode: 401 });
    expect(new Headers(ctx.options.headers).has('Authorization')).toBe(false);
  });

  it('allows tokenless requests when authOptional is enabled', async () => {
    sessionState.bearerToken = null;
    const onRequest = await captureOnRequest({ requiresAuth: true, authOptional: true });
    const ctx = { options: { headers: new Headers() } };

    await expect(onRequest(ctx)).resolves.toBeUndefined();
    expect(new Headers(ctx.options.headers).has('Authorization')).toBe(false);
  });

  it('does not auto-attach Authorization when requiresAuth is omitted', async () => {
    const onRequest = await captureOnRequest({});
    const ctx = { options: { headers: new Headers() } };

    await onRequest(ctx);

    expect(new Headers(ctx.options.headers).has('Authorization')).toBe(false);
  });
});

