import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  authenticateRequestMock,
  normalizeRoadmapCmsResponseMock,
  roadmapResponseSafeParseMock,
  roadmapTiersSafeParseMock,
  restDeleteFactoryMock,
  restDeleteHandlerMock,
  restGetFactoryMock,
  restGetHandlerMock,
  restOptionsFactoryMock,
  restOptionsHandlerMock,
  restPatchFactoryMock,
  restPatchHandlerMock,
  restPostFactoryMock,
  restPostHandlerMock,
  restPutFactoryMock,
  restPutHandlerMock,
} = vi.hoisted(() => {
  const restOptionsHandlerMock = vi.fn(async () => new Response(null, { status: 204 }));
  const restGetHandlerMock = vi.fn(async () =>
    new Response(JSON.stringify({ delegated: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
  const restPostHandlerMock = vi.fn(async () => new Response(null, { status: 201 }));
  const restDeleteHandlerMock = vi.fn(async () => new Response(null, { status: 204 }));
  const restPatchHandlerMock = vi.fn(async () => new Response(null, { status: 200 }));
  const restPutHandlerMock = vi.fn(async () => new Response(null, { status: 200 }));

  return {
    authenticateRequestMock: vi.fn(),
    normalizeRoadmapCmsResponseMock: vi.fn(),
    roadmapResponseSafeParseMock: vi.fn(),
    roadmapTiersSafeParseMock: vi.fn(),
    restOptionsFactoryMock: vi.fn(() => restOptionsHandlerMock),
    restGetFactoryMock: vi.fn(() => restGetHandlerMock),
    restPostFactoryMock: vi.fn(() => restPostHandlerMock),
    restDeleteFactoryMock: vi.fn(() => restDeleteHandlerMock),
    restPatchFactoryMock: vi.fn(() => restPatchHandlerMock),
    restPutFactoryMock: vi.fn(() => restPutHandlerMock),
    restOptionsHandlerMock,
    restGetHandlerMock,
    restPostHandlerMock,
    restDeleteHandlerMock,
    restPatchHandlerMock,
    restPutHandlerMock,
  };
});

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: authenticateRequestMock,
}));

vi.mock('@astralpirates/shared/roadmap', () => ({
  normalizeRoadmapCmsResponse: normalizeRoadmapCmsResponseMock,
}));

vi.mock('@astralpirates/shared/api-contracts', () => ({
  RoadmapTiersCmsResponseSchema: {
    safeParse: roadmapTiersSafeParseMock,
  },
  RoadmapResponseSchema: {
    safeParse: roadmapResponseSafeParseMock,
  },
}));

vi.mock('@payloadcms/next/routes', () => ({
  REST_OPTIONS: restOptionsFactoryMock,
  REST_GET: restGetFactoryMock,
  REST_POST: restPostFactoryMock,
  REST_DELETE: restDeleteFactoryMock,
  REST_PATCH: restPatchFactoryMock,
  REST_PUT: restPutFactoryMock,
}));

vi.mock('@/app/lib/payload.ts', () => ({
  payloadConfigPromise: Promise.resolve({}),
}));

const makeRoadmapRequest = () =>
  ({
    headers: new Headers(),
    nextUrl: new URL('https://astral.test/api/roadmap'),
  }) as unknown as NextRequest;

const roadmapContext = {
  params: Promise.resolve({ slug: ['roadmap'] }),
};

const nonRoadmapContext = {
  params: Promise.resolve({ slug: ['users'] }),
};

const buildRoadmapTiersResult = () => ({
  generatedAt: '2026-03-10T00:00:00.000Z',
  docs: [
    {
      id: 'tier-public',
      tierId: 'T1',
      title: 'Public',
      accessPolicy: { mode: 'public' },
      items: [
        {
          id: 'public-item',
          title: 'Visible to all',
          accessPolicy: { mode: 'public' },
        },
        {
          id: 'public-captain-item',
          title: 'Captain only in public tier',
          accessPolicy: { mode: 'role', roleSpace: 'crew', minimumRole: 'captain' },
        },
      ],
    },
    {
      id: 'tier-swabbie',
      tierId: 'T2',
      title: 'Crew',
      accessPolicy: { mode: 'role', roleSpace: 'crew', minimumRole: 'swabbie' },
      items: [
        {
          id: 'crew-default-item',
          title: 'Inherits tier policy',
        },
        {
          id: 'crew-captain-item',
          title: 'Captain only in crew tier',
          accessPolicy: { mode: 'role', roleSpace: 'crew', minimumRole: 'captain' },
        },
      ],
    },
    {
      id: 'tier-captain',
      tierId: 'T3',
      title: 'Captain',
      accessPolicy: { mode: 'role', roleSpace: 'crew', minimumRole: 'captain' },
      items: [
        {
          id: 'captain-default-item',
          title: 'Captain default',
        },
      ],
    },
  ],
});

const configureSchemaPassThrough = () => {
  roadmapTiersSafeParseMock.mockImplementation((value: unknown) => ({
    success: true as const,
    data: value,
  }));
  normalizeRoadmapCmsResponseMock.mockImplementation((value: unknown) => value);
  roadmapResponseSafeParseMock.mockImplementation((value: unknown) => ({
    success: true as const,
    data: value,
  }));
};

describe('GET /api/roadmap through payload catch-all route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureSchemaPassThrough();
  });

  it('filters tiers/items for anonymous users and disables public caching', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue(buildRoadmapTiersResult()),
      logger: {
        error: vi.fn(),
      },
    };
    authenticateRequestMock.mockResolvedValue({ payload, user: null });

    const { GET } = await import('@/app/api/[[...slug]]/route');
    const response = await GET(makeRoadmapRequest() as unknown as Request, roadmapContext as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(body.docs.map((tier: { id: string }) => tier.id)).toEqual(['tier-public']);
    expect(body.docs[0].items.map((item: { id: string }) => item.id)).toEqual(['public-item']);
  });

  it('allows swabbie users to read swabbie tiers but not captain-only entries', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue(buildRoadmapTiersResult()),
      logger: {
        error: vi.fn(),
      },
    };
    authenticateRequestMock.mockResolvedValue({
      payload,
      user: { id: 7, role: 'swabbie' },
    });

    const { GET } = await import('@/app/api/[[...slug]]/route');
    const response = await GET(makeRoadmapRequest() as unknown as Request, roadmapContext as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.docs.map((tier: { id: string }) => tier.id)).toEqual(['tier-public', 'tier-swabbie']);
    expect(body.docs[0].items.map((item: { id: string }) => item.id)).toEqual(['public-item']);
    expect(body.docs[1].items.map((item: { id: string }) => item.id)).toEqual(['crew-default-item']);
  });

  it('allows captain users to read all roadmap tiers and items', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue(buildRoadmapTiersResult()),
      logger: {
        error: vi.fn(),
      },
    };
    authenticateRequestMock.mockResolvedValue({
      payload,
      user: { id: 1, role: 'captain' },
    });

    const { GET } = await import('@/app/api/[[...slug]]/route');
    const response = await GET(makeRoadmapRequest() as unknown as Request, roadmapContext as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.docs.map((tier: { id: string }) => tier.id)).toEqual([
      'tier-public',
      'tier-swabbie',
      'tier-captain',
    ]);
    expect(body.docs[0].items.map((item: { id: string }) => item.id)).toEqual([
      'public-item',
      'public-captain-item',
    ]);
    expect(body.docs[1].items.map((item: { id: string }) => item.id)).toEqual([
      'crew-default-item',
      'crew-captain-item',
    ]);
    expect(body.docs[2].items.map((item: { id: string }) => item.id)).toEqual([
      'captain-default-item',
    ]);
  });

  it('delegates non-roadmap GET requests to Payload REST_GET handler', async () => {
    const { GET } = await import('@/app/api/[[...slug]]/route');
    const response = await GET(makeRoadmapRequest() as unknown as Request, nonRoadmapContext as any);
    const body = await response.json();

    expect(restGetHandlerMock).toHaveBeenCalledTimes(1);
    expect(authenticateRequestMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(body).toEqual({ delegated: true });
  });

  it('delegates non-roadmap OPTIONS requests to Payload REST_OPTIONS handler', async () => {
    const { OPTIONS } = await import('@/app/api/[[...slug]]/route');
    const response = await OPTIONS(makeRoadmapRequest() as unknown as Request, nonRoadmapContext as any);

    expect(restOptionsHandlerMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(204);
  });
});
