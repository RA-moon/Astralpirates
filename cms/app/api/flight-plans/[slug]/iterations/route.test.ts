import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';
import * as authModule from '@/app/api/_lib/auth';
import * as contentModule from '@/app/api/_lib/content';
import * as slugsModule from '@/app/api/_lib/slugs';

type MockedAuth = Awaited<ReturnType<typeof authModule.authenticateRequest>>;

const createRequest = (body?: Record<string, unknown>) => {
  const init: RequestInit = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  };
  return new Request('https://example.com/api/flight-plans/demo/iterations', init) as unknown as any;
};

describe('POST /api/flight-plans/:slug/iterations', () => {
  let payload: any;
  let mockAuth: MockedAuth;

  beforeEach(() => {
    vi.restoreAllMocks();
    payload = {
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    };
    mockAuth = {
      user: { id: 11, role: 'captain' } as any,
      payload,
      adminMode: {
        adminViewEnabled: false,
        adminEditEnabled: false,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    };

    vi.spyOn(authModule, 'authenticateRequest').mockResolvedValue(mockAuth);
    vi.spyOn(authModule, 'buildRequestForUser').mockResolvedValue({} as any);
    vi.spyOn(contentModule, 'resolveOwners').mockResolvedValue(new Map());
    vi.spyOn(contentModule, 'sanitizeFlightPlan').mockImplementation((plan: any) => plan);
    vi.spyOn(slugsModule, 'ensureUniqueSlug').mockImplementation(async (_payload, _collection, base) => base);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('requires a terminal source mission', async () => {
    payload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 77,
          slug: 'demo',
          title: 'Demo Mission',
          owner: 11,
          category: 'project',
          status: 'ongoing',
        },
      ],
    });

    const response = await POST(createRequest(), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Create iteration is only available for terminal missions.',
    });
  });

  it('requires eventDate for event mission iterations', async () => {
    payload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 77,
          slug: 'demo',
          title: 'Event Mission',
          owner: 11,
          category: 'event',
          status: 'success',
          series: 44,
          iterationNumber: 1,
        },
      ],
    });

    const response = await POST(createRequest(), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Event iterations require a new eventDate.',
    });
  });

  it('creates the next iteration in existing series and emits status event', async () => {
    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 77,
            slug: 'demo',
            title: 'Demo Mission',
            owner: 11,
            category: 'project',
            status: 'failure',
            summary: 'Current run',
            body: [],
            visibility: 'crew',
            accessPolicy: null,
            mediaVisibility: 'inherit',
            crewCanPromotePassengers: false,
            passengersCanCreateTasks: false,
            passengersCanCommentOnTasks: false,
            isPublic: false,
            publicContributions: false,
            gallerySlides: [
              {
                title: 'Bridge viewport',
                imageType: 'upload',
                mediaType: 'image',
                imageAlt: 'Captain bridge viewport',
                imageUrl: '/api/gallery-images/file/bridge-viewport.jpg',
                galleryImage: { id: 441 },
                creditLabel: 'Deck Camera',
                creditUrl: 'https://example.com/bridge',
              },
            ],
            series: 55,
            iterationNumber: 2,
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 90, iterationNumber: 2 }],
      });

    payload.create.mockImplementation(async ({ collection, data }: any) => {
      if (collection === 'flight-plans') {
        return {
          id: 88,
          createdAt: '2026-04-01T11:00:00.000Z',
          updatedAt: '2026-04-01T11:00:00.000Z',
          ...data,
        };
      }
      return { id: 901, ...data };
    });

    const response = await POST(
      createRequest({
        title: 'Demo Mission Iteration 3',
      }),
      {
        params: Promise.resolve({ slug: 'demo' }),
      },
    );

    expect(response.status).toBe(201);

    const createPlanCall = payload.create.mock.calls.find(
      (call: any[]) => call[0]?.collection === 'flight-plans',
    )?.[0];
    expect(createPlanCall).toBeTruthy();
    expect(createPlanCall.data.series).toBe(55);
    expect(createPlanCall.data.iterationNumber).toBe(3);
    expect(createPlanCall.data.previousIteration).toBe(77);
    expect(createPlanCall.data.status).toBe('planned');
    expect(createPlanCall.data.gallerySlides).toEqual([
      {
        label: null,
        title: 'Bridge viewport',
        caption: null,
        creditLabel: 'Deck Camera',
        creditUrl: 'https://example.com/bridge',
        mediaType: 'image',
        imageAlt: 'Captain bridge viewport',
        imageUrl: '/api/gallery-images/file/bridge-viewport.jpg',
        imageType: 'upload',
        galleryImage: 441,
      },
    ]);

    const statusEventCall = payload.create.mock.calls.find(
      (call: any[]) => call[0]?.collection === 'flight-plan-status-events',
    )?.[0];
    expect(statusEventCall).toBeTruthy();
    expect(statusEventCall.data.flightPlan).toBe(88);
    expect(statusEventCall.data.toStatus).toBe('planned');
    expect(statusEventCall.data.actionType).toBe('transition');
  });

  it('bootstraps a series when the source mission has none', async () => {
    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 77,
            slug: 'demo',
            title: 'Demo Mission',
            owner: 11,
            category: 'project',
            status: 'cancelled',
            summary: 'Cancelled run',
            body: [],
            visibility: 'crew',
            accessPolicy: null,
            mediaVisibility: 'inherit',
            crewCanPromotePassengers: false,
            passengersCanCreateTasks: false,
            passengersCanCommentOnTasks: false,
            isPublic: false,
            publicContributions: false,
            gallerySlides: [],
            series: null,
            iterationNumber: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 90, iterationNumber: 1 }],
      });

    payload.create.mockImplementation(async ({ collection, data }: any) => {
      if (collection === 'flight-plan-series') {
        return { id: 66, ...data };
      }
      if (collection === 'flight-plans') {
        return {
          id: 89,
          createdAt: '2026-04-01T11:05:00.000Z',
          updatedAt: '2026-04-01T11:05:00.000Z',
          ...data,
        };
      }
      return { id: 902, ...data };
    });

    const response = await POST(createRequest(), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(201);

    const createdSeriesCall = payload.create.mock.calls.find(
      (call: any[]) => call[0]?.collection === 'flight-plan-series',
    )?.[0];
    expect(createdSeriesCall).toBeTruthy();

    const sourceUpdateCall = payload.update.mock.calls[0]?.[0];
    expect(sourceUpdateCall.collection).toBe('flight-plans');
    expect(sourceUpdateCall.id).toBe(77);
    expect(sourceUpdateCall.data.series).toBe(66);
    expect(sourceUpdateCall.data.iterationNumber).toBe(1);
    expect(sourceUpdateCall.data.visibility).toBe('crew');
    expect(sourceUpdateCall.data.accessPolicy).toBeNull();
    expect(sourceUpdateCall.data.isPublic).toBe(false);
    expect(sourceUpdateCall.data.publicContributions).toBe(false);
    expect(sourceUpdateCall.data.passengersCanCommentOnTasks).toBe(false);
  });

  it('returns actionable 503 when lifecycle-series schema is missing', async () => {
    payload.find.mockResolvedValueOnce({
      docs: [
        {
          id: 77,
          slug: 'demo',
          title: 'Schema Drift Mission',
          owner: 11,
          category: 'project',
          status: 'failure',
          summary: 'Retry with migration',
          body: [],
          visibility: 'crew',
          accessPolicy: null,
          mediaVisibility: 'inherit',
          crewCanPromotePassengers: false,
          passengersCanCreateTasks: false,
          passengersCanCommentOnTasks: false,
          isPublic: false,
          publicContributions: false,
          gallerySlides: [],
          series: null,
          iterationNumber: 1,
        },
      ],
    });

    payload.create.mockRejectedValueOnce(
      new Error('relation "flight_plan_series" does not exist'),
    );

    const response = await POST(createRequest(), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Mission iteration storage is not ready. Run CMS migrations and retry.',
    });
  });

  it('converts legacy upload slides without galleryImage ids into url slides for iteration clone', async () => {
    payload.find
      .mockResolvedValueOnce({
        docs: [
          {
            id: 77,
            slug: 'demo',
            title: 'Legacy Gallery Mission',
            owner: 11,
            category: 'project',
            status: 'success',
            summary: 'Legacy upload-backed image-url slides',
            body: [],
            visibility: 'crew',
            accessPolicy: null,
            mediaVisibility: 'inherit',
            crewCanPromotePassengers: false,
            passengersCanCreateTasks: false,
            passengersCanCommentOnTasks: false,
            isPublic: false,
            publicContributions: false,
            gallerySlides: [
              {
                title: 'Legacy upload',
                imageType: 'upload',
                mediaType: 'image',
                imageAlt: 'Legacy upload slide',
                imageUrl: '/api/gallery-images/file/legacy-upload.jpg',
                galleryImage: null,
              },
            ],
            series: 55,
            iterationNumber: 1,
          },
        ],
      })
      .mockResolvedValueOnce({
        docs: [{ id: 91, iterationNumber: 1 }],
      });

    payload.create.mockImplementation(async ({ collection, data }: any) => {
      if (collection === 'flight-plans') {
        return {
          id: 99,
          createdAt: '2026-04-01T12:00:00.000Z',
          updatedAt: '2026-04-01T12:00:00.000Z',
          ...data,
        };
      }
      return { id: 903, ...data };
    });

    const response = await POST(createRequest(), {
      params: Promise.resolve({ slug: 'demo' }),
    });

    expect(response.status).toBe(201);
    const createPlanCall = payload.create.mock.calls.find(
      (call: any[]) => call[0]?.collection === 'flight-plans',
    )?.[0];
    expect(createPlanCall).toBeTruthy();
    expect(createPlanCall.data.gallerySlides).toEqual([
      {
        label: null,
        title: 'Legacy upload',
        caption: null,
        creditLabel: null,
        creditUrl: null,
        mediaType: 'image',
        imageAlt: 'Legacy upload slide',
        imageUrl: '/api/gallery-images/file/legacy-upload.jpg',
        imageType: 'url',
        galleryImage: null,
      },
    ]);
  });
});
