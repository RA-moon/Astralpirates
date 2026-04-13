import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  getPayloadInstanceMock,
  getNeo4jDriverMock,
  isNeo4jSyncDisabledMock,
} = vi.hoisted(() => ({
  getPayloadInstanceMock: vi.fn(),
  getNeo4jDriverMock: vi.fn(),
  isNeo4jSyncDisabledMock: vi.fn(() => false),
}));

vi.mock('@/app/lib/payload', () => ({
  getPayloadInstance: getPayloadInstanceMock,
}));

vi.mock('@/src/utils/neo4j', () => ({
  getNeo4jDriver: getNeo4jDriverMock,
  isNeo4jSyncDisabled: isNeo4jSyncDisabledMock,
}));

const makeRequest = (query = '') =>
  ({
    headers: new Headers(),
    nextUrl: new URL(`https://astral.test/api/invitations/graph${query}`),
  }) as unknown as NextRequest;

const createPayload = () => ({
  find: vi.fn(),
  findByID: vi.fn(),
});

describe('GET /api/invitations/graph', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    isNeo4jSyncDisabledMock.mockReturnValue(false);
    getNeo4jDriverMock.mockReturnValue({
      executeQuery: vi.fn(async () => ({ records: [] })),
    });
  });

  it('returns 400 when slug is missing', async () => {
    const payload = createPayload();
    getPayloadInstanceMock.mockResolvedValue(payload);

    const { GET } = await import('@/app/api/invitations/graph/route');
    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/profile slug is required/i);
    expect(body.nodes).toEqual([]);
    expect(body.edges).toEqual([]);
    expect(response.headers.get('X-API-Access-Class')).toBe('public-scoped');
  });

  it('returns only the requested profile node when no inviter edge exists', async () => {
    const payload = createPayload();
    payload.find.mockResolvedValue({
      docs: [{ id: 7, profileSlug: 'nova', callSign: 'Nova' }],
    });
    getPayloadInstanceMock.mockResolvedValue(payload);

    const { GET } = await import('@/app/api/invitations/graph/route');
    const response = await GET(makeRequest('?slug=Nova'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      nodes: [{ id: '7', profileSlug: 'nova', callSign: 'Nova' }],
      edges: [],
    });
    expect(payload.find).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 1,
        where: {
          profileSlug: {
            equals: 'nova',
          },
        },
      }),
    );
    expect(response.headers.get('X-API-Access-Class')).toBe('public-scoped');
  });

  it('returns inviter and hire edge when inviter relationship exists', async () => {
    const payload = createPayload();
    payload.find.mockResolvedValue({
      docs: [{ id: 7, profileSlug: 'nova', callSign: 'Nova' }],
    });
    payload.findByID.mockResolvedValue({ id: 1, profileSlug: 'captain', callSign: 'Captain' });
    getPayloadInstanceMock.mockResolvedValue(payload);

    const executeQuery = vi.fn(async () => ({
      records: [
        {
          get: (name: string) => (name === 'source' ? 1 : null),
        },
      ],
    }));
    getNeo4jDriverMock.mockReturnValue({ executeQuery });

    const { GET } = await import('@/app/api/invitations/graph/route');
    const response = await GET(makeRequest('?slug=nova'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      nodes: [
        { id: '7', profileSlug: 'nova', callSign: 'Nova' },
        { id: '1', profileSlug: 'captain', callSign: 'Captain' },
      ],
      edges: [{ source: '1', target: '7' }],
    });
    expect(executeQuery).toHaveBeenCalledTimes(1);
    expect(response.headers.get('X-API-Access-Class')).toBe('public-scoped');
  });
});
