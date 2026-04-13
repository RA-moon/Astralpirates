import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const fetchMock = vi.fn();
const useAsyncDataMock = vi.fn();

const createError = ({ statusCode = 500, statusMessage = 'Error' }) => {
  const error = new Error(statusMessage);
  (error as any).statusCode = statusCode;
  (error as any).statusMessage = statusMessage;
  return error;
};

vi.mock('~/modules/api', () => ({
  getRequestFetch: () => fetchMock,
}));

vi.mock('#imports', () => ({
  createError,
  useAsyncData: useAsyncDataMock,
}));

describe('useFlightPlan utilities', () => {
  const samplePlan = {
    id: 1,
    title: 'Voyage of Dawn',
    slug: 'voyage-of-dawn',
    href: '/bridge/flight-plans/voyage-of-dawn',
    summary: null,
    body: [
      {
        type: 'paragraph',
        children: [{ text: 'Prepare the sails.' }],
      },
    ],
    status: 'planned',
    statusBucket: 'archived',
    statusChangedAt: null,
    statusChangedBy: null,
    statusReason: null,
    startedAt: null,
    finishedAt: null,
    series: null,
    iterationNumber: 1,
    previousIterationId: null,
    gallerySlides: [],
    location: null,
    dateCode: null,
    displayDate: null,
    eventDate: null,
    date: null,
    ctaLabel: null,
    ctaHref: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    owner: null,
    crewPreview: [],
    crewCanPromotePassengers: false,
    passengersCanCreateTasks: false,
    isPublic: false,
    publicContributions: false,
    category: 'project',
  } as const;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchFlightPlanBySlug', () => {
    let fetchFlightPlanBySlug: typeof import('~/domains/flightPlans').fetchFlightPlanBySlug;

    beforeEach(async () => {
      vi.resetModules();
      fetchMock.mockReset();
      ({ fetchFlightPlanBySlug } = await import('~/domains/flightPlans'));
    });

    it('returns plan data when direct endpoint succeeds', async () => {
      fetchMock.mockImplementation(async (url) => {
        if (url === '/api/flight-plans/voyage-of-dawn') {
          return { plan: samplePlan };
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      const result = await fetchFlightPlanBySlug('voyage-of-dawn');

      expect(result).toEqual(samplePlan);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('falls back to collection query when direct endpoint 404s', async () => {
      fetchMock.mockImplementation(async (url) => {
        if (url === '/api/flight-plans/starlit-run') {
          const error = new Error('Not found');
          (error as any).statusCode = 404;
          throw error;
        }
        if (url.startsWith('/api/flight-plans?')) {
          return {
            plans: [samplePlan],
            total: 1,
          };
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      const result = await fetchFlightPlanBySlug('starlit-run');

      expect(result).toEqual(samplePlan);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('returns authentication error from direct endpoint without falling back', async () => {
      fetchMock.mockImplementation(async (url) => {
        if (url === '/api/flight-plans/starlit-run') {
          const error = new Error('Authentication required');
          (error as any).statusCode = 401;
          (error as any).data = { error: 'Sign in to view this mission.' };
          throw error;
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      await expect(fetchFlightPlanBySlug('starlit-run')).rejects.toMatchObject({
        statusCode: 401,
        statusMessage: 'Sign in to view this mission.',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns authorization error from direct endpoint without falling back', async () => {
      fetchMock.mockImplementation(async (url) => {
        if (url === '/api/flight-plans/starlit-run') {
          const error = new Error('Forbidden');
          (error as any).statusCode = 403;
          (error as any).data = { error: 'You do not have permission to view this mission.' };
          throw error;
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      await expect(fetchFlightPlanBySlug('starlit-run')).rejects.toMatchObject({
        statusCode: 403,
        statusMessage: 'You do not have permission to view this mission.',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('throws when slug is empty', async () => {
      await expect(fetchFlightPlanBySlug('  ')).rejects.toMatchObject({ statusCode: 404 });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('useFlightPlan', () => {
    it('wires useAsyncData with slug-aware keys and handler', async () => {
      vi.resetModules();
      useAsyncDataMock.mockReset();
      fetchMock.mockReset();
      const module = await import('~/domains/flightPlans');
      fetchMock.mockImplementation(async (url) => {
        if (url === '/api/flight-plans/voyage-of-dawn') {
          return { plan: samplePlan };
        }
        throw new Error(`Unexpected request: ${url}`);
      });

      let capturedKey: (() => string) | undefined;
      let capturedHandler: (() => Promise<any>) | undefined;
      const dataRef = ref(null);

      useAsyncDataMock.mockImplementation(async (keyGetter, handler) => {
        capturedKey = keyGetter;
        capturedHandler = handler;
        return {
          data: dataRef,
          pending: ref(false),
          error: ref(null),
        };
      });

      const slugSource = ref('voyage-of-dawn');
      const { plan } = await module.useFlightPlan(slugSource);

      expect(capturedKey?.()).toBe('flight-plan:voyage-of-dawn');
      expect(capturedHandler).toBeDefined();

      dataRef.value = await capturedHandler?.();

      expect(plan.value).toEqual(samplePlan);
    });
  });
});
