import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

vi.mock('~/modules/api', () => ({
  getRequestFetch: () => fetchMock,
}));

vi.mock('@astralpirates/shared/api-contracts', () => ({
  LogsResponseSchema: {
    parse: (value: any) => value,
  },
  FlightPlansResponseSchema: {
    parse: (value: any) => value,
  },
}));

vi.mock('~/utils/errorReporter', () => ({
  reportClientEvent: vi.fn(),
}));

describe('logs cache helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caches and invalidates log neighbor entries', async () => {
    vi.resetModules();
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.startsWith('/api/logs?')) throw new Error(`Unexpected request: ${url}`);
      return {
        logs: [{ slug: 'neighbor', createdAt: '2025-01-01T00:00:00.000Z' }],
      };
    });

    const { clearLogNeighborCache, fetchLogNeighbors, invalidateLogNeighborCache } = await import('~/utils/logs');

    clearLogNeighborCache();

    const current = { slug: 'alpha', createdAt: '2025-01-02T00:00:00.000Z' };

    await fetchLogNeighbors(current);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await fetchLogNeighbors(current);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    invalidateLogNeighborCache(' alpha ');
    await fetchLogNeighbors(current);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('evicts oldest log neighbor cache entries', async () => {
    vi.resetModules();
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.startsWith('/api/logs?')) throw new Error(`Unexpected request: ${url}`);
      return {
        logs: [{ slug: 'neighbor', createdAt: '2025-01-01T00:00:00.000Z' }],
      };
    });

    const { clearLogNeighborCache, fetchLogNeighbors } = await import('~/utils/logs');
    clearLogNeighborCache();

    const createdAt = '2025-01-02T00:00:00.000Z';
    for (let index = 0; index < 251; index += 1) {
      await fetchLogNeighbors({ slug: `log-${index}`, createdAt });
    }

    const callsAfterFill = fetchMock.mock.calls.length;
    await fetchLogNeighbors({ slug: 'log-0', createdAt });
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterFill + 2);
  });

  it('caches and invalidates mission summaries', async () => {
    vi.resetModules();
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.startsWith('/api/flight-plans?')) throw new Error(`Unexpected request: ${url}`);
      const query = url.split('?')[1] ?? '';
      const params = new URLSearchParams(query);
      const id = Number(params.get('id'));
      return {
        plans: [{ id, title: `Plan ${id}`, location: null, displayDate: null, href: `/plans/${id}` }],
      };
    });

    const { clearMissionSummaryCache, ensureMissionSummaries, invalidateMissionSummaryCache } = await import('~/utils/logs');

    clearMissionSummaryCache();

    await ensureMissionSummaries([1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('id=1'));

    await ensureMissionSummaries([1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    invalidateMissionSummaryCache(1);
    await ensureMissionSummaries([1]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('evicts oldest mission summary cache entries', async () => {
    vi.resetModules();
    fetchMock.mockImplementation(async (url: string) => {
      if (!url.startsWith('/api/flight-plans?')) throw new Error(`Unexpected request: ${url}`);
      const query = url.split('?')[1] ?? '';
      const params = new URLSearchParams(query);
      const id = Number(params.get('id'));
      return {
        plans: [{ id, title: `Plan ${id}`, location: null, displayDate: null, href: `/plans/${id}` }],
      };
    });

    const { clearMissionSummaryCache, ensureMissionSummaries } = await import('~/utils/logs');
    clearMissionSummaryCache();

    await ensureMissionSummaries(Array.from({ length: 501 }, (_, index) => index + 1));
    const callsAfterFill = fetchMock.mock.calls.length;

    await ensureMissionSummaries([1]);
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterFill + 1);
  });

  it('treats mismatched mission summary ids as invalid', async () => {
    vi.resetModules();
    fetchMock.mockResolvedValue({
      plans: [{ id: 999, title: 'Wrong plan', location: null, displayDate: null, href: '/plans/999' }],
    });

    const { clearMissionSummaryCache, ensureMissionSummaries } = await import('~/utils/logs');
    clearMissionSummaryCache();

    const result = await ensureMissionSummaries([1]);
    expect(result.get(1)).toBeNull();
  });
});
