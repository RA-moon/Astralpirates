import { computed, isRef, type Ref } from 'vue';
import { z } from 'zod';
import { createError, useAsyncData } from '#imports';
import { getRequestFetch } from '~/modules/api';
import { FlightPlanSummarySchema, FlightPlansResponseSchema } from '@astralpirates/shared/api-contracts';
import { useSessionStore } from '~/stores/session';

type MaybeRefOrGetter<T> = T | Ref<T> | (() => T);

const FlightPlanSingleResponseSchema = z.object({
  plan: FlightPlanSummarySchema,
  revision: z.number().int().positive().optional(),
  etag: z.string().optional(),
});

const resolveValue = <T>(source: MaybeRefOrGetter<T>): T => {
  if (typeof source === 'function') {
    return (source as () => T)();
  }
  if (isRef(source)) {
    return (source as Ref<T>).value;
  }
  return source;
};

const resolveAuthHeaders = (): Record<string, string> => {
  try {
    const session = useSessionStore();
    const bearerToken = session.bearerToken;
    if (typeof bearerToken === 'string' && bearerToken.trim().length > 0) {
      return { Authorization: `Bearer ${bearerToken.trim()}` };
    }
  } catch {
    // ignore store access errors (e.g., during early boot)
  }
  return {};
};

const resolveStatusCode = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const candidate = (error as { statusCode?: unknown; response?: { status?: unknown } }).statusCode ??
    (error as { response?: { status?: unknown } }).response?.status;
  const parsed = Number.parseInt(String(candidate ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveStatusMessage = (error: unknown): string | null => {
  if (!error || typeof error !== 'object') return null;
  const err = error as {
    statusMessage?: unknown;
    message?: unknown;
    data?: { error?: unknown };
    response?: { _data?: { error?: unknown } };
  };
  const dataError =
    typeof err.data?.error === 'string'
      ? err.data.error.trim()
      : typeof err.response?._data?.error === 'string'
        ? err.response._data.error.trim()
        : '';
  if (dataError.length > 0) return dataError;
  const statusMessage = typeof err.statusMessage === 'string' ? err.statusMessage.trim() : '';
  if (statusMessage.length > 0) return statusMessage;
  const message = typeof err.message === 'string' ? err.message.trim() : '';
  if (message.length > 0) return message;
  return null;
};

export const fetchFlightPlanBySlug = async (slug: string) => {
  const trimmedSlug = slug.trim();
  if (!trimmedSlug) {
    throw createError({ statusCode: 404, statusMessage: 'Flight plan not found' });
  }

  const fetcher = getRequestFetch();
  const authHeaders = resolveAuthHeaders();

  try {
    const direct = await fetcher(`/api/flight-plans/${encodeURIComponent(trimmedSlug)}`, {
      headers: authHeaders,
    });
    const parsedDirect = FlightPlanSingleResponseSchema.safeParse(direct);
    if (parsedDirect.success && parsedDirect.data.plan) {
      const { plan, revision, etag } = parsedDirect.data;
      return {
        ...plan,
        revision: revision ?? plan.revision,
        etag: etag ?? plan.etag,
      };
    }
  } catch (error: any) {
    const statusCode = resolveStatusCode(error);
    if (statusCode === 401 || statusCode === 403) {
      throw createError({
        statusCode,
        statusMessage:
          resolveStatusMessage(error) ??
          (statusCode === 401
            ? 'Sign in to view this flight plan.'
            : 'You do not have permission to view this flight plan.'),
      });
    }
    if (statusCode === 404) {
      // Ignore 404 and fall back to filtered query.
    } else if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('Direct flight plan fetch failed; falling back to query', error);
    }
  }

  const params = new URLSearchParams();
  params.set('limit', '1');
  params.set('slug', trimmedSlug);

  let response: unknown;
  try {
    response = await fetcher(`/api/flight-plans?${params.toString()}`, { headers: authHeaders });
  } catch (error) {
    const statusCode = resolveStatusCode(error);
    if (statusCode === 401 || statusCode === 403) {
      throw createError({
        statusCode,
        statusMessage:
          resolveStatusMessage(error) ??
          (statusCode === 401
            ? 'Sign in to view this flight plan.'
            : 'You do not have permission to view this flight plan.'),
      });
    }
    throw error;
  }
  const parsedCollection = FlightPlansResponseSchema.safeParse(response);
  if (parsedCollection.success) {
    const [doc] = parsedCollection.data.plans;
    if (doc) {
      return doc;
    }
  }

  throw createError({ statusCode: 404, statusMessage: 'Flight plan not found' });
};

export const useFlightPlan = async (
  slugSource: MaybeRefOrGetter<string | null | undefined>,
) => {
  const slug = computed(() => {
    const value = resolveValue(slugSource);
    return typeof value === 'string' ? value.trim() : null;
  });

  const asyncData = await useAsyncData(
    () => `flight-plan:${slug.value ?? 'missing'}`,
    () => {
      const currentSlug = slug.value;
      if (!currentSlug) {
        throw createError({ statusCode: 404, statusMessage: 'Flight plan not found' });
      }
      return fetchFlightPlanBySlug(currentSlug);
    },
    {
      watch: [slug],
    },
  );

  return {
    ...asyncData,
    plan: computed(() => asyncData.data.value ?? null),
  };
};
