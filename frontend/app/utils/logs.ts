import { getRequestFetch } from '~/modules/api';
import {
  FlightPlansResponseSchema,
  LogsResponseSchema,
  type LogSummary,
  type FlightPlanSummary,
} from '@astralpirates/shared/api-contracts';
import { reportClientEvent } from '~/utils/errorReporter';

const sortLogsByRecency = <T extends Pick<LogSummary, 'createdAt'>>(logs: T[]): T[] => {
  return [...logs].sort((a, b) => {
    const aTime = Date.parse(a.createdAt ?? '');
    const bTime = Date.parse(b.createdAt ?? '');
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return bTime - aTime;
  });
};

export type LogNeighbors = {
  previous: LogSummary | null;
  next: LogSummary | null;
};

const parseSingleLog = async (requestFetch: ReturnType<typeof getRequestFetch>, params: URLSearchParams) => {
  const response = await requestFetch(`/api/logs?${params.toString()}`);
  const parsed = LogsResponseSchema.parse(response);
  return parsed.logs[0] ?? null;
};

const setBoundedCacheValue = <K, V>(cache: Map<K, V>, key: K, value: V, maxEntries: number) => {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size <= maxEntries) return;
  const oldestKey = cache.keys().next().value;
  if (oldestKey === undefined) return;
  cache.delete(oldestKey);
};

const MAX_NEIGHBOR_CACHE_ENTRIES = 250;

const neighborCache = new Map<string, LogNeighbors>();
const SHOULD_CACHE = typeof window !== 'undefined';

export const clearLogNeighborCache = () => {
  if (!SHOULD_CACHE) return;
  neighborCache.clear();
};

export const invalidateLogNeighborCache = (slug: string) => {
  if (!SHOULD_CACHE) return;
  const trimmed = slug.trim();
  if (!trimmed) return;
  neighborCache.delete(trimmed);
};

export const fetchLogNeighbors = async (
  current: Pick<LogSummary, 'slug' | 'createdAt'>,
  options: { forceRefresh?: boolean } = {},
): Promise<LogNeighbors> => {
  const slug = current.slug?.trim() ?? '';
  if (!slug) {
    return { previous: null, next: null };
  }

  if (SHOULD_CACHE && !options.forceRefresh && neighborCache.has(slug)) {
    return neighborCache.get(slug)!;
  }

  const requestFetch = getRequestFetch();
  const baseParams = () => {
    const search = new URLSearchParams();
    search.set('limit', '1');
    return search;
  };

  let previous: LogSummary | null = null;
  let next: LogSummary | null = null;

  if (current.createdAt) {
    const previousParams = baseParams();
    previousParams.set('createdBefore', current.createdAt);

    const nextParams = baseParams();
    nextParams.set('createdAfter', current.createdAt);

    const [previousResult, nextResult] = await Promise.all([
      parseSingleLog(requestFetch, previousParams),
      parseSingleLog(requestFetch, nextParams),
    ]);

    previous = previousResult && previousResult.slug !== slug ? previousResult : null;
    next = nextResult && nextResult.slug !== slug ? nextResult : null;
  }

  if (!previous || !next) {
    const fallbackParams = new URLSearchParams();
    fallbackParams.set('limit', '100');
    const response = await requestFetch(`/api/logs?${fallbackParams.toString()}`);
    const parsed = LogsResponseSchema.parse(response);
    const sorted = sortLogsByRecency(parsed.logs);
    const index = sorted.findIndex((entry) => entry.slug === slug);

    if (index !== -1) {
      if (!previous && index > 0) previous = sorted[index - 1] ?? null;
      if (!next && index < sorted.length - 1) next = sorted[index + 1] ?? null;
    }
  }

  const result = { previous, next };
  if (SHOULD_CACHE) {
    setBoundedCacheValue(neighborCache, slug, result, MAX_NEIGHBOR_CACHE_ENTRIES);
  }
  return result;
};

export type MissionSummary = Pick<FlightPlanSummary, 'id' | 'title' | 'location' | 'displayDate'> & {
  href: string;
};

const MAX_MISSION_CACHE_ENTRIES = 500;

const missionCache = new Map<number, MissionSummary | null>();

export const clearMissionSummaryCache = () => {
  if (!SHOULD_CACHE) return;
  missionCache.clear();
};

export const invalidateMissionSummaryCache = (id: number) => {
  if (!SHOULD_CACHE) return;
  missionCache.delete(id);
};

const fetchMissionSummary = async (
  requestFetch: ReturnType<typeof getRequestFetch>,
  id: number,
): Promise<MissionSummary | null> => {
  const params = new URLSearchParams();
  params.set('limit', '1');
  params.set('id', String(id));
  const response = await requestFetch(`/api/flight-plans?${params.toString()}`);
  const parsed = FlightPlansResponseSchema.parse(response);
  const plan = parsed.plans[0] ?? null;
  if (!plan) return null;
  if (plan.id !== id) {
    reportClientEvent({
      component: 'LogUtils',
      message: 'Received mismatched mission summary response',
      level: 'warn',
      meta: {
        requestedFlightPlanId: id,
        returnedFlightPlanId: plan.id,
      },
    });
    return null;
  }
  return {
    id: plan.id,
    title: plan.title,
    location: plan.location,
    displayDate: plan.displayDate,
    href: plan.href,
  };
};

export const ensureMissionSummaries = async (ids: number[]): Promise<Map<number, MissionSummary | null>> => {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0))).map((id) => Number(id));
  if (!uniqueIds.length) return new Map();

  const cache = SHOULD_CACHE ? missionCache : new Map<number, MissionSummary | null>();
  const missing = uniqueIds.filter((id) => !cache.has(id));
  if (missing.length) {
    const requestFetch = getRequestFetch();
    const resolved = await Promise.all(
      missing.map(async (id) => {
        try {
          return await fetchMissionSummary(requestFetch, id);
        } catch (error) {
          reportClientEvent({
            component: 'LogUtils',
            message: 'Failed to fetch mission summary',
            error,
            level: 'warn',
            meta: { flightPlanId: id },
          });
          return null;
        }
      }),
    );
    missing.forEach((id, index) => {
      setBoundedCacheValue(cache, id, resolved[index] ?? null, MAX_MISSION_CACHE_ENTRIES);
    });
  }

  const result = new Map<number, MissionSummary | null>();
  uniqueIds.forEach((id) => {
    result.set(id, cache.get(id) ?? null);
  });

  return result;
};

export const getMissionSummaryFromCache = (id: number): MissionSummary | null => missionCache.get(id) ?? null;
