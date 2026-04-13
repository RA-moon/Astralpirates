import { beforeEach, describe, expect, it, vi } from 'vitest';

let cachedOptions: Record<string, unknown> | undefined;
const defineCachedEventHandler = vi.fn((handler, options) => {
  cachedOptions = options;
  return handler;
});

const setHeader = (event: any, name: string, value: string) => {
  if (!event.headers) event.headers = {};
  event.headers[name] = value;
};

const getHeader = (event: any, name: string) => {
  const headers = event.headers || {};
  const key = Object.keys(headers).find((header) => header.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
};

const parseCookies = (event: any) => {
  const cookieHeader = getHeader(event, 'cookie');
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawName, ...rest] = part.split('=');
    const name = rawName?.trim();
    if (!name) return acc;
    acc[name] = rest.join('=').trim();
    return acc;
  }, {});
};

const getRouterParam = (event: any, name: string) =>
  event.context?.params?.[name] ?? event.params?.[name] ?? '';

const useRuntimeConfig = vi.fn();
const useNitroApp = vi.fn();
const fetchPlansFromCms = vi.fn();
const fetchPlanDetailFromCms = vi.fn();

vi.mock('h3', () => ({ setHeader, getHeader, parseCookies, getRouterParam }), { virtual: true });
vi.mock('#imports', () => ({ useRuntimeConfig, useNitroApp, defineCachedEventHandler }));
vi.mock('@astralpirates/shared/plans', () => ({
  fetchPlansFromCms,
  fetchPlanDetailFromCms,
  normalizePlanDetail: (plan: any) => ({ generatedAt: 'now', plan }),
}));

const createEvent = (headers: Record<string, string> = {}) => ({
  headers,
  node: { res: { statusCode: 200 } },
});

describe('api/plans routes', () => {
  let listHandler: (event: any) => Promise<any>;
  let detailHandler: (event: any) => Promise<any>;

  beforeEach(async () => {
    fetchPlansFromCms.mockReset();
    fetchPlanDetailFromCms.mockReset();
    useRuntimeConfig.mockReset();
    useNitroApp.mockReset();
    cachedOptions = undefined;
    vi.resetModules();
    listHandler = (await import('../../server/routes/api/plans')).default;
    detailHandler = (await import('../../server/routes/api/plans/[slug]')).default;
  });

  it('returns 401 when unauthenticated (list)', async () => {
    useRuntimeConfig.mockReturnValue({ astralApiBase: 'https://cms.example', public: {} });
    useNitroApp.mockReturnValue({ logger: { warn: vi.fn() } });

    const event = createEvent();
    const result = await listHandler(event as any);

    expect(event.node.res.statusCode).toBe(401);
    expect(result).toEqual({ plans: [], generatedAt: null });
    expect(fetchPlansFromCms).not.toHaveBeenCalled();
  });

  it('serves plans when authorized via bearer', async () => {
    const payload = {
      generatedAt: 'now',
      plans: [
        {
          id: 'alpha',
          slug: 'alpha',
          title: 'Alpha',
          owner: 'Owner',
          tier: 'tier2',
          status: 'queued',
          cloudStatus: 'pending',
          summary: null,
          lastUpdated: null,
          path: null,
          links: [],
          body: [],
        },
      ],
    };
    fetchPlansFromCms.mockResolvedValueOnce(payload);
    useRuntimeConfig.mockReturnValue({ astralApiBase: 'https://cms.example', public: {} });
    useNitroApp.mockReturnValue({ logger: { warn: vi.fn() } });

    const event = createEvent({ authorization: 'Bearer token' });
    const result = await listHandler(event as any);

    expect(event.headers['Cache-Control']).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=300',
    );
    expect(result).toEqual(payload);
    expect(fetchPlansFromCms).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://cms.example' }),
    );
  });

  it('accepts auth via cookie for list route', async () => {
    const payload = { generatedAt: 'now', plans: [] };
    fetchPlansFromCms.mockResolvedValueOnce(payload);
    useRuntimeConfig.mockReturnValue({ astralApiBase: 'https://cms.example', public: {} });
    useNitroApp.mockReturnValue({ logger: { warn: vi.fn() } });

    const event = createEvent({ cookie: 'payload-token=abc123; theme=dark' });
    const result = await listHandler(event as any);

    expect(event.node.res.statusCode).toBe(200);
    expect(result).toEqual(payload);
    expect(fetchPlansFromCms).toHaveBeenCalled();
  });

  it('forwards auth cookies to the CMS fetcher', async () => {
    const payload = { generatedAt: 'now', plans: [] };
    fetchPlansFromCms.mockResolvedValueOnce(payload);
    useRuntimeConfig.mockReturnValue({ astralApiBase: 'https://cms.example', public: {} });
    useNitroApp.mockReturnValue({ logger: { warn: vi.fn() } });

    const event = createEvent({ cookie: 'payload-token=abc123; theme=dark' });
    await listHandler(event as any);

    const options = fetchPlansFromCms.mock.calls[0]?.[0] as { fetchImpl?: typeof fetch } | undefined;
    expect(typeof options?.fetchImpl).toBe('function');

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ docs: [] }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchSpy as any;

    await options!.fetchImpl!(
      'https://cms.example/api/plans',
      { headers: { Accept: 'application/json' } },
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://cms.example/api/plans',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'application/json',
          cookie: 'payload-token=abc123',
        }),
      }),
    );

    globalThis.fetch = originalFetch;
  });

  it('returns 401 when unauthenticated (detail)', async () => {
    useRuntimeConfig.mockReturnValue({ astralApiBase: 'https://cms.example', public: {} });
    useNitroApp.mockReturnValue({ logger: { warn: vi.fn() } });

    const event = createEvent();
    const result = await detailHandler(event as any);

    expect(event.node.res.statusCode).toBe(401);
    expect(result).toEqual({ generatedAt: 'now', plan: null });
    expect(fetchPlansFromCms).not.toHaveBeenCalled();
  });

  it('serves plan detail when authorized via cookie', async () => {
    const payload = {
      generatedAt: 'now',
      plans: [
        {
          id: 'alpha',
          slug: 'alpha',
          title: 'Alpha',
          owner: 'Owner',
          tier: 'tier2',
          status: 'queued',
          cloudStatus: 'pending',
          summary: null,
          lastUpdated: null,
          path: null,
          links: [],
          body: [],
        },
      ],
    };
    fetchPlanDetailFromCms.mockResolvedValueOnce(payload.plans[0]);
    useRuntimeConfig.mockReturnValue({ astralApiBase: 'https://cms.example', public: {} });
    useNitroApp.mockReturnValue({ logger: { warn: vi.fn() } });

    const event = createEvent({ cookie: 'astralpirates-session=abc123' });
    event.context = { params: { slug: 'alpha' } };
    const result = await detailHandler(event as any);

    expect(event.headers['Cache-Control']).toBe(
      'public, max-age=0, s-maxage=300, stale-while-revalidate=300',
    );
    expect(result).toEqual({ generatedAt: expect.any(String), plan: payload.plans[0] });
    expect(fetchPlanDetailFromCms).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://cms.example', slug: 'alpha' }),
    );
    expect(fetchPlansFromCms).not.toHaveBeenCalled();
  });

  it('registers cached handlers', () => {
    expect(defineCachedEventHandler).toHaveBeenCalled();
    expect(cachedOptions).toMatchObject({ maxAge: 300 });
  });
});
