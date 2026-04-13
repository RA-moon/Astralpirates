import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const { getPayloadInstanceMock, readFileMock, readdirMock, payloadFindMock } = vi.hoisted(() => ({
  getPayloadInstanceMock: vi.fn(),
  readFileMock: vi.fn(),
  readdirMock: vi.fn(),
  payloadFindMock: vi.fn(),
}));

vi.mock('@/app/lib/payload', () => ({
  getPayloadInstance: getPayloadInstanceMock,
}));

vi.mock('node:fs/promises', () => ({
  readFile: readFileMock,
  readdir: readdirMock,
}));

const makeRequest = (url = 'https://astralpirates.com/api/status') =>
  ({
    headers: new Headers(),
    nextUrl: new URL(url),
  }) as unknown as NextRequest;

const jsonResponse = (status: number, payload: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  }) as Response;

const originalFetch = globalThis.fetch;

describe('GET /api/status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'));
    payloadFindMock.mockResolvedValue({ docs: [] });
    getPayloadInstanceMock.mockResolvedValue({
      logger: { warn: vi.fn() },
      find: payloadFindMock,
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('returns healthy status payload when probes + host artifacts are healthy', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path === '/opt/backups/status.json') {
        return JSON.stringify({
          ok: true,
          lastRun: '2026-04-02T11:45:00.000Z',
        });
      }
      if (path === '/opt/shared/deploy-log.md') {
        return '* 2026-04-02 11:20:05 UTC — ci-23897790882 (3b85dbd5) by actions (main)\n';
      }
      throw new Error(`Unexpected file read: ${path}`);
    });
    readdirMock.mockResolvedValue([]);

    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/api/ship-status/metrics')) {
        return jsonResponse(200, { ok: true, generatedAt: '2026-04-02T11:59:00.000Z' });
      }
      return jsonResponse(404, { ok: false });
    }) as typeof fetch;

    const { GET } = await import('@/app/api/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=0, s-maxage=30, stale-while-revalidate=30',
    );
    expect(body.ok).toBe(true);
    expect(body.state).toBe('healthy');
    expect(body.components).toHaveLength(3);
    expect(body.components.find((component: any) => component.id === 'cms')?.state).toBe('healthy');
    expect(body.components.find((component: any) => component.id === 'backups')?.state).toBe('healthy');
    expect(body.components.find((component: any) => component.id === 'deploy')?.state).toBe('healthy');
    expect(payloadFindMock).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'pages', limit: 1, depth: 0, overrideAccess: true }),
    );
    expect(payloadFindMock).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'users', limit: 1, depth: 0, overrideAccess: true }),
    );
  });

  it('returns degraded + unknown components when probes fail and host artifacts are missing', async () => {
    const warn = vi.fn();
    getPayloadInstanceMock.mockResolvedValue({
      logger: { warn },
      find: payloadFindMock,
    });
    payloadFindMock.mockImplementation(async (args: { collection?: string }) => {
      if (args?.collection === 'pages') {
        throw new Error('pages unavailable');
      }
      if (args?.collection === 'users') {
        throw new Error('users unavailable');
      }
      return { docs: [] };
    });

    readFileMock.mockImplementation(async () => {
      throw new Error('ENOENT');
    });
    readdirMock.mockResolvedValue([]);

    globalThis.fetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/api/ship-status/metrics')) return jsonResponse(500, { ok: false });
      return jsonResponse(404, { ok: false });
    }) as typeof fetch;

    const { GET } = await import('@/app/api/status/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.state).toBe('degraded');
    expect(body.components.find((component: any) => component.id === 'cms')?.state).toBe('degraded');
    expect(body.components.find((component: any) => component.id === 'backups')?.state).toBe('unknown');
    expect(body.components.find((component: any) => component.id === 'deploy')?.state).toBe('unknown');
    expect(warn).toHaveBeenCalled();
  });

  it('serves cached payload for 30 seconds before refreshing', async () => {
    readFileMock.mockImplementation(async (path: string) => {
      if (path === '/opt/backups/status.json') {
        return JSON.stringify({
          ok: true,
          lastRun: '2026-04-02T11:45:00.000Z',
        });
      }
      if (path === '/opt/shared/deploy-log.md') {
        return '* 2026-04-02 11:20:05 UTC — ci-23897790882 (3b85dbd5) by actions (main)\n';
      }
      throw new Error(`Unexpected file read: ${path}`);
    });
    readdirMock.mockResolvedValue([]);

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/api/ship-status/metrics')) {
        return jsonResponse(200, { ok: true, generatedAt: '2026-04-02T11:59:00.000Z' });
      }
      return jsonResponse(404, { ok: false });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const { GET } = await import('@/app/api/status/route');

    const first = await GET(makeRequest());
    const firstBody = await first.json();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(10 * 1000);
    const second = await GET(makeRequest());
    const secondBody = await second.json();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(secondBody.generatedAt).toBe(firstBody.generatedAt);

    vi.advanceTimersByTime(31 * 1000);
    const third = await GET(makeRequest());
    const thirdBody = await third.json();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(thirdBody.generatedAt).not.toBe(firstBody.generatedAt);
  });
});
