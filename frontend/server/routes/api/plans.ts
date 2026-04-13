import { defineCachedEventHandler } from '#imports';
import { PlansResponseSchema, type PlansResponse } from '@astralpirates/shared/api-contracts';
import { fetchPlansFromCms } from '@astralpirates/shared/plans';
import plansSnapshot from '~/generated/plans.json' with { type: 'json' };

import {
  loadFromCms,
  markFallback,
  resolveCmsRouteContext,
  runCmsCachedRoute,
} from '../../utils/cms';

const CACHE_HEADER = 'public, max-age=0, s-maxage=300, stale-while-revalidate=300';
const CACHE_MAX_AGE_SECONDS = 300;

const FALLBACK_PLANS: PlansResponse = (() => {
  const parsed = PlansResponseSchema.safeParse(plansSnapshot);
  if (parsed.success) return parsed.data;
  return { plans: [], generatedAt: null };
})();

const cachedHandler = defineCachedEventHandler(
  async (event) => {
    const { baseUrl, logger: cmsLogger, fetchWithAuth } = resolveCmsRouteContext(event);
    const plans = await loadFromCms({
      baseUrl,
      logger: cmsLogger,
      fetcher: (options) =>
        fetchPlansFromCms({
          ...options,
          fetchImpl: fetchWithAuth,
        }),
      missingConfigMessage: '[plans] Missing astralApiBase runtime config; falling back to snapshot',
      errorLogMessage: '[plans] Failed to load CMS data',
    });
    if (!plans) {
      markFallback(
        event,
        'X-Plans-Fallback',
        'snapshot',
        cmsLogger,
        '[plans] Using snapshot fallback (CMS unreachable or misconfigured)',
      );
      return FALLBACK_PLANS;
    }
    return plans;
  },
  { name: 'api-plans', maxAge: CACHE_MAX_AGE_SECONDS },
);

export default async (event: Parameters<Parameters<typeof defineCachedEventHandler>[0]>[0]) => {
  return runCmsCachedRoute({
    event,
    cacheControl: CACHE_HEADER,
    cachedHandler,
    onUnauthorized: () => ({ plans: [], generatedAt: null }),
  });
};
