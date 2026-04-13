import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
  buildRequestForUser: vi.fn(),
}));

vi.mock('@/app/api/_lib/flightPlanMembers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/flightPlanMembers')>(
    '@/app/api/_lib/flightPlanMembers',
  );
  return {
    ...actual,
    canEditFlightPlan: vi.fn(),
    listCrewPreviewMemberIds: vi.fn(),
    loadMembershipWithOwnerFallback: vi.fn(),
  };
});

vi.mock('@/app/api/_lib/editorWrites', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/editorWrites')>(
    '@/app/api/_lib/editorWrites',
  );
  return {
    ...actual,
    ensureEditorDocumentRevision: vi.fn(async ({ documentType, documentId }: any) => ({
      documentType,
      documentId,
      revision: 1,
      updatedAt: '2026-03-30T00:00:00.000Z',
    })),
    loadEditorDocumentLock: vi.fn(async () => null),
    beginEditorWriteIdempotency: vi.fn(async () => ({ status: 'new' })),
    completeEditorWriteIdempotency: vi.fn(async () => undefined),
    bumpEditorDocumentRevision: vi.fn(
      async ({ documentType, documentId, expectedRevision }: any) => ({
        documentType,
        documentId,
        revision: Number(expectedRevision) + 1,
        updatedAt: '2026-03-30T00:00:00.000Z',
      }),
    ),
  };
});

import { GET, PATCH } from '@/app/api/flight-plans/[slug]/route';
import { authenticateRequest, buildRequestForUser } from '@/app/api/_lib/auth';
import {
  canEditFlightPlan,
  listCrewPreviewMemberIds,
  loadMembershipWithOwnerFallback,
} from '@/app/api/_lib/flightPlanMembers';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedBuildRequestForUser = vi.mocked(buildRequestForUser);
const mockedCanEditFlightPlan = vi.mocked(canEditFlightPlan);
const mockedListCrewPreviewMemberIds = vi.mocked(listCrewPreviewMemberIds);
const mockedLoadMembershipWithOwnerFallback = vi.mocked(loadMembershipWithOwnerFallback);

const makeRequest = (body: any) =>
  ({
    headers: new Headers(),
    json: async () => ({
      baseRevision: 1,
      idempotencyKey: 'test-idempotency-key',
      ...body,
    }),
  }) as unknown as NextRequest;

const makeGetRequest = () =>
  ({
    headers: new Headers(),
  }) as unknown as NextRequest;

const createPayload = () => {
  const payload = {
    find: vi.fn().mockResolvedValue({ docs: [] }),
    update: vi.fn(),
    logger: {
      error: vi.fn(),
      warn: vi.fn(),
    },
  };
  return payload;
};

describe('GET /api/flight-plans/:slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListCrewPreviewMemberIds.mockResolvedValue(new Map());
  });

  it('allows public missions for anonymous viewers', async () => {
    const payload = createPayload();
    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 12,
            slug: 'voyage',
            title: 'Voyage',
            owner: { id: 5 },
            path: 'bridge/flight-plans/voyage',
            body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
            dateCode: null,
            displayDate: null,
            eventDate: null,
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            isPublic: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 5, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });

    mockedAuthenticateRequest.mockResolvedValue({ payload, user: null } as any);

    const response = await GET(makeGetRequest(), { params: { slug: 'voyage' } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan.slug).toBe('voyage');
    expect(mockedListCrewPreviewMemberIds).toHaveBeenCalledWith(
      expect.objectContaining({
        payload,
        flightPlanIds: [12],
      }),
    );
  });

  it('allows accepted passengers to view private missions', async () => {
    const payload = createPayload();
    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 18,
            slug: 'covert',
            title: 'Covert Ops',
            owner: { id: 6 },
            path: 'bridge/flight-plans/covert',
            body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
            createdAt: '2025-01-01T00:00:00.000Z',
            updatedAt: '2025-01-02T00:00:00.000Z',
            isPublic: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 6, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 42, profileSlug: 'passenger', role: 'seaman' },
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue({
      id: 9,
      flightPlanId: 18,
      userId: 42,
      role: 'guest',
      status: 'accepted',
      invitedById: 6,
      invitedAt: '2025-01-02T00:00:00.000Z',
      respondedAt: '2025-01-03T00:00:00.000Z',
    });

    const response = await GET(makeGetRequest(), { params: { slug: 'covert' } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.plan.slug).toBe('covert');
    expect(mockedLoadMembershipWithOwnerFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        payload,
        flightPlanId: 18,
        userId: 42,
      }),
    );
  });

  it('returns 401 for private missions when viewer is unauthenticated', async () => {
    const payload = createPayload();
    payload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 21,
          slug: 'hidden',
          title: 'Hidden Run',
          owner: { id: 7 },
          path: 'bridge/flight-plans/hidden',
          body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
          isPublic: false,
        },
      ],
    });

    mockedAuthenticateRequest.mockResolvedValue({ payload, user: null } as any);

    const response = await GET(makeGetRequest(), { params: { slug: 'hidden' } });
    expect(response.status).toBe(401);
    expect(mockedLoadMembershipWithOwnerFallback).not.toHaveBeenCalled();
    expect(mockedListCrewPreviewMemberIds).not.toHaveBeenCalled();
  });

  it('rejects logged-in viewers who are not on the roster', async () => {
    const payload = createPayload();
    payload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 31,
          slug: 'secure',
          title: 'Secure Ops',
          owner: { id: 8 },
          path: 'bridge/flight-plans/secure',
          body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
          isPublic: false,
        },
      ],
    });

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 77, profileSlug: 'observer', role: 'scout' },
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue(null);

    const response = await GET(makeGetRequest(), { params: { slug: 'secure' } });
    expect(response.status).toBe(403);
    expect(mockedLoadMembershipWithOwnerFallback).toHaveBeenCalledWith(
      expect.objectContaining({
        flightPlanId: 31,
        userId: 77,
      }),
    );
    expect(mockedListCrewPreviewMemberIds).not.toHaveBeenCalled();
  });
});
describe('PATCH /api/flight-plans/:slug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects guests attempting to edit missions', async () => {
    const payload = createPayload();
    payload.find.mockResolvedValue({
      docs: [
        {
          id: 25,
          slug: 'voyage',
          owner: { id: 1 },
          dateCode: '20250101',
          displayDate: 'January 1, 2025',
          eventDate: '2025-01-01T00:00:00.000Z',
        },
      ],
    });
    const authContext = { payload, user: { id: 3 } };
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedCanEditFlightPlan.mockResolvedValue(false);

    const response = await PATCH(makeRequest({ title: 'Updated', body: [{ type: 'paragraph', children: [{ text: 'Body' }] }] }), {
      params: { slug: 'voyage' },
    });
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Only the captain or confirmed crew/);
    expect(mockedCanEditFlightPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        payload,
        flightPlanId: 25,
        userId: 3,
      }),
    );
  });

  it('allows accepted crew to edit mission details', async () => {
    const payload = createPayload();
    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 30,
            slug: 'expedition',
            owner: { id: 4 },
            dateCode: '20250110',
            displayDate: 'January 10, 2025',
            eventDate: '2025-01-10T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 4, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });
    payload.update.mockResolvedValue({
      id: 30,
      slug: 'expedition',
      owner: { id: 4 },
      title: 'Refit Expedition',
      summary: 'Updated summary',
      body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
      dateCode: '20250214',
      displayDate: 'February 14, 2025',
      eventDate: '2025-02-14T00:00:00.000Z',
    });

    const authContext = { payload, user: { id: 7 } };
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const requestBody = {
      title: 'Refit Expedition',
      summary: 'Updated summary',
      location: 'Mars Dock',
      eventDate: '2025-02-14',
      gallerySlides: [
        {
          imageType: 'url',
          imageUrl: 'https://artifact.astralpirates.com/gallery/refit.jpg',
          imageAlt: 'Refit concept art',
          mediaType: 'image',
        },
      ],
      body: [
        {
          type: 'paragraph',
          children: [{ text: 'Body' }],
        },
      ],
    };
    const response = await PATCH(makeRequest(requestBody), { params: { slug: 'expedition' } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.plan.title).toBe('Refit Expedition');
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 30,
        data: expect.objectContaining({
          title: 'Refit Expedition',
          summary: 'Updated summary',
          location: 'Mars Dock',
          dateCode: '20250214',
          displayDate: 'February 14, 2025',
          gallerySlides: [
            expect.objectContaining({
              imageType: 'url',
              imageUrl: 'https://artifact.astralpirates.com/gallery/refit.jpg',
              imageAlt: 'Refit concept art',
            }),
          ],
        }),
      }),
    );
  });

  it('rejects crew organisers changing captain-only visibility controls', async () => {
    const payload = createPayload();
    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 33,
            slug: 'captain-only-controls',
            owner: { id: 4 },
            body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
            isPublic: false,
            dateCode: '20250110',
            displayDate: 'January 10, 2025',
            eventDate: '2025-01-10T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 4, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });

    mockedAuthenticateRequest.mockResolvedValue({ payload, user: { id: 7 } } as any);
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await PATCH(makeRequest({ isPublic: true }), {
      params: { slug: 'captain-only-controls' },
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/Only the captain can change mission collaboration or visibility settings/i);
    expect(payload.update).not.toHaveBeenCalled();
  });

  it('rejects invalid category values', async () => {
    const payload = createPayload();
    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 41,
            slug: 'expedition',
            owner: { id: 9 },
            dateCode: '20250110',
            displayDate: 'January 10, 2025',
            eventDate: '2025-01-10T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 9, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });
    const authContext = { payload, user: { id: 9 } };
    mockedAuthenticateRequest.mockResolvedValue(authContext as any);
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await PATCH(makeRequest({ category: 'invalid' }), { params: { slug: 'expedition' } });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/Category must be one of/i);
    expect(payload.update).not.toHaveBeenCalled();
  });

  it('accepts owner-only updates when owner and user ids differ only by type', async () => {
    const payload = createPayload();
    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 55,
            slug: 'typed-owner',
            owner: '9',
            body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
            dateCode: '20250110',
            displayDate: 'January 10, 2025',
            eventDate: '2025-01-10T00:00:00.000Z',
            isPublic: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 9, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });
    payload.update.mockResolvedValue({
      id: 55,
      slug: 'typed-owner',
      owner: { id: 9 },
      body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
      isPublic: true,
    });

    mockedAuthenticateRequest.mockResolvedValue({ payload, user: { id: 9 } } as any);
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await PATCH(makeRequest({ isPublic: true }), { params: { slug: 'typed-owner' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plan.isPublic).toBe(true);
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 55,
        data: expect.objectContaining({
          isPublic: true,
        }),
      }),
    );
  });

  it('maps isPublic toggles onto access policy writes when policy already exists', async () => {
    const payload = createPayload();
    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 56,
            slug: 'policy-toggle',
            owner: { id: 9 },
            body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
            dateCode: '20250110',
            displayDate: 'January 10, 2025',
            eventDate: '2025-01-10T00:00:00.000Z',
            accessPolicy: { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'passenger' },
            visibility: 'passengers',
            isPublic: false,
            publicContributions: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 9, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });
    payload.update.mockResolvedValue({
      id: 56,
      slug: 'policy-toggle',
      owner: { id: 9 },
      body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
      accessPolicy: { mode: 'public' },
      visibility: 'public',
      isPublic: true,
      publicContributions: false,
    });

    mockedAuthenticateRequest.mockResolvedValue({ payload, user: { id: 9 } } as any);
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await PATCH(makeRequest({ isPublic: true }), { params: { slug: 'policy-toggle' } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plan.isPublic).toBe(true);
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 56,
        data: expect.objectContaining({
          accessPolicy: { mode: 'public' },
          visibility: 'public',
          isPublic: true,
          publicContributions: false,
        }),
      }),
    );
  });

  it('maps public contribution toggles onto crew-scoped access policy', async () => {
    const payload = createPayload();
    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 57,
            slug: 'contrib-toggle',
            owner: { id: 9 },
            body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
            dateCode: '20250110',
            displayDate: 'January 10, 2025',
            eventDate: '2025-01-10T00:00:00.000Z',
            accessPolicy: { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'passenger' },
            visibility: 'passengers',
            isPublic: false,
            publicContributions: false,
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 9, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
      });
    payload.update.mockResolvedValue({
      id: 57,
      slug: 'contrib-toggle',
      owner: { id: 9 },
      body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
      accessPolicy: { mode: 'role', roleSpace: 'crew', minimumRole: 'seaman' },
      visibility: 'passengers',
      isPublic: false,
      publicContributions: true,
    });

    mockedAuthenticateRequest.mockResolvedValue({ payload, user: { id: 9 } } as any);
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await PATCH(makeRequest({ publicContributions: true }), {
      params: { slug: 'contrib-toggle' },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.plan.publicContributions).toBe(true);
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 57,
        data: expect.objectContaining({
          accessPolicy: expect.objectContaining({ mode: 'role', roleSpace: 'crew' }),
          visibility: 'passengers',
          isPublic: false,
          publicContributions: true,
        }),
      }),
    );
  });

  it('persists upload slides without null image URLs', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: any) => {
      if (args?.collection === 'flight-plans') {
        return {
          docs: [
            {
              id: 77,
              slug: 'flying-concrete-table',
              owner: { id: 11 },
              body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
              dateCode: '20250110',
              displayDate: 'January 10, 2025',
              eventDate: '2025-01-10T00:00:00.000Z',
            },
          ],
        };
      }

      if (args?.collection === 'gallery-images') {
        if (args?.where?.id?.in) {
          // Simulate an unresolved asset URL from hydration lookup.
          return { docs: [{ id: 5 }] };
        }
        // Keep cleanup pass deterministic.
        return { docs: [{ id: 5 }] };
      }

      if (args?.collection === 'users') {
        return {
          docs: [{ id: 11, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
        };
      }

      return { docs: [] };
    });
    payload.update.mockResolvedValue({
      id: 77,
      slug: 'flying-concrete-table',
      owner: { id: 11 },
      title: 'Flying Concrete Table',
      body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
      gallerySlides: [
        {
          imageType: 'upload',
          galleryImage: 5,
          imageUrl: '',
          imageAlt: 'Concrete table model',
          mediaType: 'model',
        },
      ],
    });

    mockedAuthenticateRequest.mockResolvedValue({ payload, user: { id: 11 } } as any);
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await PATCH(
      makeRequest({
        gallerySlides: [
          {
            imageType: 'upload',
            galleryImage: 5,
            imageUrl: '',
            imageAlt: 'Concrete table model',
            mediaType: 'model',
          },
        ],
      }),
      { params: { slug: 'flying-concrete-table' } },
    );

    expect(response.status).toBe(200);
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 77,
        data: expect.objectContaining({
          gallerySlides: [
            expect.objectContaining({
              imageType: 'upload',
              galleryImage: 5,
              imageUrl: '',
              mediaType: 'model',
            }),
          ],
        }),
      }),
    );
  });

  it('re-links upload slides from gallery file URLs when relation ids are missing', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: any) => {
      if (args?.collection === 'flight-plans') {
        return {
          docs: [
            {
              id: 78,
              slug: 'dome-project',
              owner: { id: 11 },
              body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
            },
          ],
        };
      }

      if (args?.collection === 'gallery-images') {
        const filenameFilter = args?.where?.and?.find?.(
          (entry: any) => entry && typeof entry === 'object' && 'filename' in entry,
        ) as { filename?: { in?: string[] } } | undefined;
        if (Array.isArray(filenameFilter?.filename?.in)) {
          return {
            docs: [
              {
                id: 42,
                filename: 'mission-one.glb',
              },
            ],
          };
        }

        if (Array.isArray(args?.where?.id?.in)) {
          return {
            docs: [
              {
                id: 42,
              },
            ],
          };
        }

        return { docs: [] };
      }

      if (args?.collection === 'users') {
        return {
          docs: [{ id: 11, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
        };
      }

      return { docs: [] };
    });
    payload.update.mockResolvedValue({
      id: 78,
      slug: 'dome-project',
      owner: { id: 11 },
      body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
      gallerySlides: [
        {
          imageType: 'upload',
          galleryImage: 42,
          imageUrl: '/api/gallery-images/file/mission-one.glb',
          imageAlt: 'Geodesic dome model',
          mediaType: 'model',
        },
      ],
    });

    mockedAuthenticateRequest.mockResolvedValue({ payload, user: { id: 11 } } as any);
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await PATCH(
      makeRequest({
        gallerySlides: [
          {
            imageType: 'upload',
            galleryImage: null,
            imageUrl: '/api/gallery-images/file/mission-one.glb',
            imageAlt: 'Geodesic dome model',
            mediaType: 'model',
          },
        ],
      }),
      { params: { slug: 'dome-project' } },
    );

    expect(response.status).toBe(200);
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 78,
        data: expect.objectContaining({
          gallerySlides: [
            expect.objectContaining({
              imageType: 'upload',
              galleryImage: 42,
              imageUrl: '/api/gallery-images/file/mission-one.glb',
            }),
          ],
        }),
      }),
    );
  });

  it('drops missing upload slide references and still updates the mission', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: any) => {
      if (args?.collection === 'flight-plans') {
        return {
          docs: [
            {
              id: 88,
              slug: 'dome-project',
              owner: { id: 11 },
              body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
            },
          ],
        };
      }

      if (args?.collection === 'gallery-images') {
        return { docs: [] };
      }

      if (args?.collection === 'users') {
        return {
          docs: [{ id: 11, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
        };
      }

      return { docs: [] };
    });
    payload.update.mockResolvedValue({
      id: 88,
      slug: 'dome-project',
      owner: { id: 11 },
      body: [{ type: 'paragraph', children: [{ text: 'Body' }] }],
      gallerySlides: [],
    });

    mockedAuthenticateRequest.mockResolvedValue({ payload, user: { id: 11 } } as any);
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await PATCH(
      makeRequest({
        gallerySlides: [
          {
            imageType: 'upload',
            galleryImage: 55,
            imageUrl: '',
            imageAlt: 'Stale upload reference',
            mediaType: 'image',
          },
        ],
      }),
      { params: { slug: 'dome-project' } },
    );

    expect(response.status).toBe(200);
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 88,
        data: expect.objectContaining({
          gallerySlides: [],
        }),
      }),
    );
  });

  it('hydrates a fallback mission body when legacy plans save gallery slides without body content', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: any) => {
      if (args?.collection === 'flight-plans') {
        return {
          docs: [
            {
              id: 89,
              slug: 'legacy-dome',
              owner: { id: 11 },
              title: 'Legacy Dome',
              summary: 'Legacy mission imported without rich text body.',
              body: null,
            },
          ],
        };
      }

      if (args?.collection === 'gallery-images') {
        return {
          docs: [{ id: 5 }],
        };
      }

      if (args?.collection === 'users') {
        return {
          docs: [{ id: 11, profileSlug: 'captain', callSign: 'Captain', role: 'captain' }],
        };
      }

      return { docs: [] };
    });
    payload.update.mockResolvedValue({
      id: 89,
      slug: 'legacy-dome',
      owner: { id: 11 },
      title: 'Legacy Dome',
      summary: 'Legacy mission imported without rich text body.',
      body: {
        root: {
          type: 'root',
          version: 1,
          children: [
            {
              type: 'paragraph',
              version: 1,
              children: [{ type: 'text', text: 'Legacy mission imported without rich text body.', version: 1 }],
              direction: null,
              format: '',
              indent: 0,
              textFormat: 0,
              textStyle: '',
            },
          ],
          direction: null,
          format: '',
          indent: 0,
        },
      },
      gallerySlides: [
        {
          imageType: 'upload',
          galleryImage: 5,
          imageUrl: '',
          imageAlt: 'Legacy dome image',
          mediaType: 'image',
        },
      ],
    });

    mockedAuthenticateRequest.mockResolvedValue({ payload, user: { id: 11 } } as any);
    mockedBuildRequestForUser.mockResolvedValue({} as any);
    mockedCanEditFlightPlan.mockResolvedValue(true);

    const response = await PATCH(
      makeRequest({
        gallerySlides: [
          {
            imageType: 'upload',
            galleryImage: 5,
            imageUrl: '',
            imageAlt: 'Legacy dome image',
            mediaType: 'image',
          },
        ],
      }),
      { params: { slug: 'legacy-dome' } },
    );

    expect(response.status).toBe(200);
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 89,
        data: expect.objectContaining({
          body: expect.any(Object),
          gallerySlides: [
            expect.objectContaining({
              imageType: 'upload',
              galleryImage: 5,
            }),
          ],
        }),
      }),
    );
  });
});
