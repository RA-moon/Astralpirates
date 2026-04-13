import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let cachedOptions: Record<string, unknown> | undefined;
const defineCachedEventHandler = vi.fn((handler, options) => {
  cachedOptions = options;
  return handler;
});

const setHeader = (event: any, name: string, value: string) => {
  if (!event.headers) {
    event.headers = {};
  }
  event.headers[name] = value;
};

const useRuntimeConfig = vi.fn();
const useNitroApp = vi.fn();
const fetchNavigationNodesFromCms = vi.fn();

vi.mock('h3', () => ({ setHeader }), { virtual: true });
vi.mock('#imports', () => ({ useRuntimeConfig, useNitroApp, defineCachedEventHandler }));
vi.mock('@astralpirates/shared/navigationNodes', () => ({
  fetchNavigationNodesFromCms,
}));

let handler: (event: any) => Promise<any>;

beforeAll(async () => {
  handler = (await import('../../server/routes/api/navigation-nodes')).default;
});

const createEvent = () => ({ headers: {} });

describe('api/navigation-nodes route', () => {
  beforeEach(() => {
    fetchNavigationNodesFromCms.mockReset();
    useRuntimeConfig.mockReset();
    useNitroApp.mockReset();
  });

  it('serves live docs from the CMS when available', async () => {
    const docs = [
      {
        id: 42,
        nodeId: 'bridge',
        label: 'Bridge Live',
        description: 'updated',
        sourcePath: '/bridge',
      },
    ];
    fetchNavigationNodesFromCms.mockResolvedValueOnce(docs);
    useRuntimeConfig.mockReturnValue({
      astralApiBase: 'https://cms.example',
      public: { astralApiBase: 'https://cms.example' },
    });
    const warn = vi.fn();
    useNitroApp.mockReturnValue({ logger: { warn } });

    const event = createEvent();
    const result = await handler(event as any);

    expect(result).toEqual({ docs });
    expect(event.headers['Cache-Control']).toBe(
      'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
    );
    expect(fetchNavigationNodesFromCms).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://cms.example' }),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to defaults and logs when the CMS call fails', async () => {
    fetchNavigationNodesFromCms.mockImplementationOnce(async (options) => {
      options?.onError?.(new Error('boom'), { endpoint: 'https://cms.example/api/navigation-nodes' });
      return null;
    });
    useRuntimeConfig.mockReturnValue({
      astralApiBase: 'https://cms.example',
      public: { astralApiBase: 'https://cms.example' },
    });
    const warn = vi.fn();
    useNitroApp.mockReturnValue({ logger: { warn } });

    const event = createEvent();
    const result = await handler(event as any);

    expect(result.docs).toEqual([
      {
        id: 1,
        nodeId: 'airlock-home',
        label: 'Airlock (home)',
        description: 'Astralpirates.com landing bay',
        sourcePath: '/',
      },
      {
        id: 2,
        nodeId: 'bridge',
        label: 'Bridge',
        description: 'Mission control + command logs',
        sourcePath: '/bridge',
      },
      {
        id: 3,
        nodeId: 'gangway',
        label: 'Gangway',
        description: 'Crew recruitment + about pages',
        sourcePath: '/gangway',
      },
      {
        id: 4,
        nodeId: 'logbook',
        label: 'Logbook',
        description: 'Flight logs + mission journals',
        sourcePath: '/logbook',
      },
    ]);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        endpoint: 'https://cms.example/api/navigation-nodes',
      }),
      '[navigation-nodes] Failed to load CMS overrides',
    );
  });

  it('registers the route with a 60s cached event handler', () => {
    expect(defineCachedEventHandler).toHaveBeenCalledTimes(1);
    expect(cachedOptions).toMatchObject({ name: 'api-navigation-nodes', maxAge: 60 });
  });
});
