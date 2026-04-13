import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock('@/app/api/_lib/flightPlanMembers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/flightPlanMembers')>(
    '@/app/api/_lib/flightPlanMembers',
  );
  return {
    ...actual,
    listCrewPreviewMemberIds: vi.fn(),
    loadMembershipsForUser: vi.fn(),
  };
});

import { GET } from '@/app/api/flight-plans/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  listCrewPreviewMemberIds,
  loadMembershipsForUser,
} from '@/app/api/_lib/flightPlanMembers';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedListCrewPreviewMemberIds = vi.mocked(listCrewPreviewMemberIds);
const mockedLoadMembershipsForUser = vi.mocked(loadMembershipsForUser);

const makeRequest = (query: Record<string, string | string[] | null | undefined>) => {
  const url = new URL('https://astral.test/api/flight-plans');
  Object.entries(query).forEach(([key, value]) => {
    if (typeof value === 'string') {
      url.searchParams.set(key, value);
    } else if (Array.isArray(value)) {
      value.filter((entry): entry is string => typeof entry === 'string').forEach((entry) => {
        url.searchParams.append(key, entry);
      });
    }
  });
  return {
    headers: new Headers(),
    nextUrl: url,
  } as unknown as NextRequest;
};

describe('GET /api/flight-plans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListCrewPreviewMemberIds.mockResolvedValue(new Map());
  });

  it('filters flight plans by member slug', async () => {
    const payload = {
      find: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({ payload } as any);
    mockedLoadMembershipsForUser.mockResolvedValue([
      {
        id: 1,
        flightPlanId: 200,
        userId: 44,
        role: 'crew',
        status: 'accepted',
        invitedById: null,
        invitedAt: null,
        respondedAt: '2025-01-01T00:00:00.000Z',
      },
    ]);

    payload.find
      // crew lookup
      .mockResolvedValueOnce({
        totalDocs: 1,
        docs: [{ id: 44, profileSlug: 'crew-one', role: 'crew' }],
      })
      // flight plan query
      .mockResolvedValueOnce({
        docs: [
          {
            id: 200,
            slug: 'voyage',
            title: 'Voyage',
            owner: { id: 9 },
            path: 'flight-plans/captain/voyage',
            summary: null,
            location: null,
            dateCode: null,
            displayDate: 'January 1, 2025',
            eventDate: '2025-01-01T00:00:00.000Z',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            crewCanPromotePassengers: false,
            isPublic: true,
            body: [
              {
                type: 'paragraph',
                children: [{ text: 'Body copy' }],
              },
            ],
          },
        ],
      })
      // resolveOwners lookup
      .mockResolvedValueOnce({
        docs: [{ id: 9, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });

    const response = await GET(
      makeRequest({
        memberSlug: 'crew-one',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0].href).toBe('/bridge/flight-plans/voyage');
    expect(body.plans[0].isPublic).toBe(true);
    expect(mockedLoadMembershipsForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        payload,
        acceptedOnly: true,
      }),
    );
    const planQuery = payload.find.mock.calls[1]?.[0];
    expect(planQuery?.where).toMatchObject({
      and: [
        {
          or: [
            {
              isPublic: {
                equals: true,
              },
            },
            {
              visibility: {
                equals: 'public',
              },
            },
          ],
        },
        {
          id: {
            in: [200],
          },
        },
      ],
    });
  });

  it('includes private missions for accepted members', async () => {
    const payload = {
      find: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 77, profileSlug: 'crew', role: 'crew' },
    } as any);
    mockedLoadMembershipsForUser.mockResolvedValueOnce([
      {
        id: 1,
        flightPlanId: 300,
        userId: 77,
        role: 'guest',
        status: 'accepted',
        invitedById: null,
        invitedAt: null,
        respondedAt: '2025-01-01T00:00:00.000Z',
      },
    ]);

    payload.find
      // flight plan query
      .mockResolvedValueOnce({
        docs: [
          {
            id: 300,
            slug: 'secret',
            title: 'Secret Voyage',
            owner: { id: 9 },
            path: 'bridge/flight-plans/secret',
            summary: null,
            location: null,
            dateCode: null,
            displayDate: 'January 5, 2025',
            eventDate: '2025-01-05T00:00:00.000Z',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            crewCanPromotePassengers: false,
            isPublic: false,
            body: [
              {
                type: 'paragraph',
                children: [{ text: 'Secret mission' }],
              },
            ],
          },
        ],
      })
      // resolveOwners lookup
      .mockResolvedValueOnce({
        docs: [{ id: 9, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });

    const response = await GET(makeRequest({}));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0].slug).toBe('secret');
    expect(body.plans[0].isPublic).toBe(false);

    const planQuery = payload.find.mock.calls[0]?.[0];
    expect(planQuery?.where).toMatchObject({
      or: expect.arrayContaining([
        {
          isPublic: {
            equals: true,
          },
        },
        {
          id: {
            in: [300],
          },
        },
        {
          publicContributions: {
            equals: true,
          },
        },
      ]),
    });

    expect(mockedLoadMembershipsForUser).toHaveBeenCalledWith(
      expect.objectContaining({
        payload,
        userId: 77,
        acceptedOnly: true,
      }),
    );
  });

  it('includes private missions for captain admin-read/edit override without memberships', async () => {
    const payload = {
      find: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 88, profileSlug: 'captain', role: 'captain' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    } as any);
    mockedLoadMembershipsForUser.mockResolvedValueOnce([]);

    payload.find
      // flight plan query
      .mockResolvedValueOnce({
        docs: [
          {
            id: 444,
            slug: 'black-ops',
            title: 'Black Ops',
            owner: { id: 9 },
            path: 'bridge/flight-plans/black-ops',
            summary: null,
            location: null,
            dateCode: null,
            displayDate: 'January 7, 2025',
            eventDate: '2025-01-07T00:00:00.000Z',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            crewCanPromotePassengers: false,
            isPublic: false,
            visibility: 'captain',
            body: [
              {
                type: 'paragraph',
                children: [{ text: 'Classified mission' }],
              },
            ],
          },
        ],
      })
      // resolveOwners lookup
      .mockResolvedValueOnce({
        docs: [{ id: 9, profileSlug: 'owner', callSign: 'Owner', role: 'captain' }],
      });

    const response = await GET(makeRequest({}));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0].slug).toBe('black-ops');
    expect(body.plans[0].isPublic).toBe(false);

    const planQuery = payload.find.mock.calls[0]?.[0];
    expect(planQuery?.where).toBeUndefined();
  });

  it('does not elevate private mission reads for non-captains with spoofed admin toggles', async () => {
    const payload = {
      find: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 88, profileSlug: 'deckhand', role: 'seamen' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: false,
          canUseAdminEdit: false,
        },
      },
    } as any);
    mockedLoadMembershipsForUser.mockResolvedValueOnce([]);

    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 501,
            slug: 'public-voyage',
            title: 'Public Voyage',
            owner: { id: 9 },
            path: 'bridge/flight-plans/public-voyage',
            summary: null,
            location: null,
            dateCode: null,
            displayDate: 'January 8, 2025',
            eventDate: '2025-01-08T00:00:00.000Z',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            crewCanPromotePassengers: false,
            isPublic: true,
            body: [
              {
                type: 'paragraph',
                children: [{ text: 'Visible mission' }],
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 9, profileSlug: 'owner', callSign: 'Owner', role: 'captain' }],
      });

    const response = await GET(makeRequest({}));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0].slug).toBe('public-voyage');

    const planQuery = payload.find.mock.calls[0]?.[0];
    expect(planQuery?.where).toMatchObject({
      or: expect.arrayContaining([
        {
          isPublic: {
            equals: true,
          },
        },
        {
          visibility: {
            equals: 'public',
          },
        },
        {
          publicContributions: {
            equals: true,
          },
        },
        {
          owner: {
            equals: 88,
          },
        },
      ]),
    });
  });

  it('applies category filters when provided', async () => {
    const payload = {
      find: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({ payload } as any);
    mockedLoadMembershipsForUser.mockResolvedValue([]);

    payload.find
      // flight plan query
      .mockResolvedValueOnce({
        docs: [
          {
            id: 501,
            slug: 'project-alpha',
            title: 'Project Alpha',
            owner: { id: 91 },
            path: 'bridge/flight-plans/project-alpha',
            summary: null,
            location: null,
            category: 'project',
            dateCode: null,
            displayDate: 'January 1, 2025',
            eventDate: '2025-01-01T00:00:00.000Z',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            crewCanPromotePassengers: false,
            isPublic: true,
            body: [
              {
                type: 'paragraph',
                children: [{ text: 'Body copy' }],
              },
            ],
          },
        ],
      })
      // resolveOwners lookup
      .mockResolvedValueOnce({
        docs: [{ id: 91, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });

    const response = await GET(
      makeRequest({
        category: ['Project', 'event'],
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0].category).toBe('project');

    const planQuery = payload.find.mock.calls[0]?.[0];
    const categoryCondition = (planQuery?.where?.and ?? []).find(
      (entry: any) => entry?.category,
    );
    expect(categoryCondition?.category?.in).toEqual(['project', 'event']);
  });

  it('filters flight plans by explicit id query', async () => {
    const payload = {
      find: vi.fn(),
      logger: {
        warn: vi.fn(),
        error: vi.fn(),
      },
    };

    mockedAuthenticateRequest.mockResolvedValue({ payload } as any);
    mockedLoadMembershipsForUser.mockResolvedValue([]);

    payload.find
      // flight plan query
      .mockResolvedValueOnce({
        docs: [
          {
            id: 777,
            slug: 'target-plan',
            title: 'Target plan',
            owner: { id: 25 },
            path: 'bridge/flight-plans/target-plan',
            summary: null,
            location: null,
            category: 'project',
            dateCode: null,
            displayDate: 'January 1, 2025',
            eventDate: '2025-01-01T00:00:00.000Z',
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            crewCanPromotePassengers: false,
            isPublic: true,
            body: [
              {
                type: 'paragraph',
                children: [{ text: 'Body copy' }],
              },
            ],
          },
        ],
      })
      // resolveOwners lookup
      .mockResolvedValueOnce({
        docs: [{ id: 25, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });

    const response = await GET(
      makeRequest({
        id: '777',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plans).toHaveLength(1);
    expect(body.plans[0].id).toBe(777);

    const planQuery = payload.find.mock.calls[0]?.[0];
    expect(planQuery?.limit).toBe(1);
    expect(planQuery?.where).toMatchObject({
      and: [
        {
          or: [
            {
              isPublic: {
                equals: true,
              },
            },
            {
              visibility: {
                equals: 'public',
              },
            },
          ],
        },
        {
          id: {
            equals: 777,
          },
        },
      ],
    });
  });

  it('rejects invalid id query values', async () => {
    const response = await GET(
      makeRequest({
        id: 'abc',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'id must be a positive integer.',
    });
    expect(mockedAuthenticateRequest).not.toHaveBeenCalled();
  });
});
