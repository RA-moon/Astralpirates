import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fallbackRoadmap from '~/generated/roadmap.json' with { type: 'json' };

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
const getHeader = (event: any, name: string) => {
  if (!event?.headers || typeof name !== 'string') {
    return undefined;
  }
  const exact = event.headers[name];
  if (typeof exact === 'string') return exact;
  const lower = event.headers[name.toLowerCase()];
  if (typeof lower === 'string') return lower;
  const upper = event.headers[name.toUpperCase()];
  if (typeof upper === 'string') return upper;
  return undefined;
};
const parseCookies = () => ({});

const useRuntimeConfig = vi.fn();
const useNitroApp = vi.fn();
const fetchRoadmapFromCms = vi.fn();

vi.mock('h3', () => ({ setHeader, getHeader, parseCookies }), { virtual: true });
vi.mock('#imports', () => ({ useRuntimeConfig, useNitroApp, defineCachedEventHandler }));
vi.mock('@astralpirates/shared/roadmap', () => ({
  fetchRoadmapFromCms,
}));

let handler: (event: any) => Promise<any>;

beforeAll(async () => {
  handler = (await import('../../server/routes/api/roadmap')).default;
});

const createEvent = () => ({
  headers: { authorization: 'Bearer test-token' },
  node: { res: { statusCode: 200 } },
});

describe('api/roadmap route', () => {
  beforeEach(() => {
    fetchRoadmapFromCms.mockReset();
    useRuntimeConfig.mockReset();
    useNitroApp.mockReset();
  });

  it('serves roadmap data from the CMS when available', async () => {
    const roadmap = {
      generatedAt: '2025-11-27T00:00:00.000Z',
      tiers: [
        {
          id: 'tier1',
          tier: 'tier1',
          title: 'Tier 1',
          description: null,
          focus: null,
          statusSummary: null,
          items: [
            {
              id: 'T2.06',
              code: 'T2.06',
              title: 'Serve Control roadmap from CMS',
              summary: null,
              status: 'active',
              cloudStatus: 'pending',
              referenceLabel: null,
              referenceUrl: null,
              plan: {
                id: 'engineering-roadmap-cms',
                title: 'Engineering Roadmap CMS Plan',
                owner: 'Platform & DX',
                path: 'docs/planning/engineering-roadmap-cms.md',
                status: 'active',
                cloudStatus: 'pending',
              },
            },
          ],
        },
      ],
    };
    fetchRoadmapFromCms.mockResolvedValueOnce(roadmap);
    useRuntimeConfig.mockReturnValue({
      astralApiBase: 'https://cms.example',
      public: { astralApiBase: 'https://cms.example' },
    });
    const warn = vi.fn();
    useNitroApp.mockReturnValue({ logger: { warn } });

    const event = createEvent();
    const result = await handler(event as any);

    expect(result).toEqual(roadmap);
    expect(event.headers['Cache-Control']).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=300',
    );
    expect(fetchRoadmapFromCms).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://cms.example' }),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('falls back to the bundled snapshot and logs when CMS data is unavailable', async () => {
    fetchRoadmapFromCms.mockImplementationOnce(async (options) => {
      options?.onError?.(new Error('boom'), { endpoint: 'https://cms.example/api/roadmap-tiers' });
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

    const fallbackTiers = (fallbackRoadmap as any).tiers ?? [];
    expect(result.tiers.length).toBe(fallbackTiers.length);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error), endpoint: expect.any(String) }),
      '[roadmap] Failed to load CMS data',
    );
  });

  it('registers the route with a cached handler', () => {
    expect(defineCachedEventHandler).toHaveBeenCalledTimes(1);
    expect(cachedOptions).toMatchObject({ name: 'api-roadmap', maxAge: 300 });
  });
});
