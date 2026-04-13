import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportClientEvent } from '~/utils/errorReporter';

const flushMicrotasks = async (rounds = 4) => {
  for (let index = 0; index < rounds; index += 1) {
    await Promise.resolve();
  }
};

const waitForCallCount = async (mock: ReturnType<typeof vi.fn>, expectedCalls: number) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (mock.mock.calls.length >= expectedCalls) {
      return;
    }
    await flushMicrotasks();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe('reportClientEvent', () => {
  const originalFetch = globalThis.fetch;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('retries once after bootstrapping token when POST returns 403', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Missing client-event token.' }), { status: 403 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    reportClientEvent({
      message: 'Probe',
      component: 'unit-test',
    });

    await waitForCallCount(fetchMock, 3);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/client-events',
      expect.objectContaining({
        method: 'POST',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/client-events',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/client-events',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });

  it('does not bootstrap when first POST succeeds', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    globalThis.fetch = fetchMock as unknown as typeof fetch;

    reportClientEvent({
      message: 'Probe',
      component: 'unit-test',
    });

    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/client-events',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});
