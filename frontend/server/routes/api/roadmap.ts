import { defineCachedEventHandler } from '#imports';
import { RoadmapResponseSchema, type RoadmapResponse } from '@astralpirates/shared/api-contracts';
import { fetchRoadmapFromCms } from '@astralpirates/shared/roadmap';
import roadmapSnapshot from '~/generated/roadmap.json' with { type: 'json' };

import {
  loadFromCms,
  markFallback,
  resolveCmsRouteContext,
  runCmsCachedRoute,
} from '../../utils/cms';

const CACHE_HEADER = 'public, max-age=0, s-maxage=300, stale-while-revalidate=300';
const CACHE_MAX_AGE_SECONDS = 300;

const FALLBACK_ROADMAP: RoadmapResponse = (() => {
  const parsed = RoadmapResponseSchema.safeParse(roadmapSnapshot);
  if (parsed.success) return parsed.data;
  return { tiers: [], generatedAt: null };
})();

const filterArchivedPlans = (roadmap: RoadmapResponse): RoadmapResponse => ({
  generatedAt: roadmap.generatedAt,
  tiers: roadmap.tiers.map((tier) => ({
    ...tier,
    items: tier.items.filter((item) => item.status !== 'tested' && item.status !== 'canceled'),
  })),
});

const cachedHandler = defineCachedEventHandler(
  async (event) => {
    const { baseUrl, logger: cmsLogger, fetchWithAuth } = resolveCmsRouteContext(event);
    const roadmap = await loadFromCms({
      baseUrl,
      logger: cmsLogger,
      fetcher: (options) =>
        fetchRoadmapFromCms({
          ...options,
          fetchImpl: fetchWithAuth,
        }),
      missingConfigMessage: '[roadmap] Missing astralApiBase runtime config; falling back to snapshot',
      errorLogMessage: '[roadmap] Failed to load CMS data',
    });
    if (!roadmap) {
      markFallback(
        event,
        'X-Roadmap-Fallback',
        'snapshot',
        cmsLogger,
        '[roadmap] Using snapshot fallback (CMS unreachable or misconfigured)',
      );
      return filterArchivedPlans(FALLBACK_ROADMAP);
    }
    return filterArchivedPlans(roadmap);
  },
  { name: 'api-roadmap', maxAge: CACHE_MAX_AGE_SECONDS },
);

export default async (event: Parameters<Parameters<typeof defineCachedEventHandler>[0]>[0]) => {
  return runCmsCachedRoute({
    event,
    cacheControl: CACHE_HEADER,
    cachedHandler,
    onUnauthorized: () => ({ tiers: [], generatedAt: null }),
  });
};
