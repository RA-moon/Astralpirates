import { getRouterParam } from 'h3';
import { defineCachedEventHandler } from '#imports';
import { PlansResponseSchema } from '@astralpirates/shared/api-contracts';
import {
  fetchPlanDetailFromCms,
  fetchPlansFromCms,
  normalizePlanDetail,
} from '@astralpirates/shared/plans';
import plansSnapshot from '~/generated/plans.json' with { type: 'json' };

import {
  loadFromCms,
  resolveCmsRouteContext,
  runCmsCachedRoute,
} from '../../../utils/cms';

const CACHE_HEADER = 'public, max-age=0, s-maxage=300, stale-while-revalidate=300';
const CACHE_MAX_AGE_SECONDS = 300;

const FALLBACK_PLANS = (() => {
  const parsed = PlansResponseSchema.safeParse(plansSnapshot);
  if (parsed.success) return parsed.data;
  return { plans: [], generatedAt: null };
})();

const findPlan = (slug: string, data: typeof FALLBACK_PLANS['plans']) => {
  const needle = slug.trim().toLowerCase();
  return data.find(
    (plan) =>
      plan.slug?.toLowerCase() === needle ||
      plan.id?.toLowerCase() === needle ||
      plan.title.toLowerCase() === needle,
  );
};

const cachedHandler = defineCachedEventHandler(
  async (event) => {
    const slug = getRouterParam(event, 'slug') ?? '';
    const { baseUrl, logger: cmsLogger, fetchWithAuth } = resolveCmsRouteContext(event);

    const plan = await loadFromCms({
      baseUrl,
      logger: cmsLogger,
      fetcher: (options) =>
        fetchPlanDetailFromCms({
          ...options,
          slug,
          fetchImpl: fetchWithAuth,
        }),
      missingConfigMessage:
        '[plans/detail] Missing astralApiBase runtime config; falling back to snapshot',
      errorLogMessage: '[plans/detail] Failed to load CMS data',
    });

    if (plan) {
      return normalizePlanDetail(plan);
    }

    const plans = await loadFromCms({
      baseUrl,
      logger: cmsLogger,
      fetcher: (options) =>
        fetchPlansFromCms({
          ...options,
          fetchImpl: fetchWithAuth,
        }),
      missingConfigMessage:
        '[plans/detail] Missing astralApiBase runtime config; falling back to snapshot',
      errorLogMessage: '[plans/detail] Failed to load CMS data',
    });
    const fallbackPlan = findPlan(slug, FALLBACK_PLANS.plans);
    const resolvedPlan =
      plans?.plans && plans.plans.length > 0 ? findPlan(slug, plans.plans) : fallbackPlan;

    if (!resolvedPlan) {
      event.node.res.statusCode = 404;
      return normalizePlanDetail(null);
    }

    return normalizePlanDetail(resolvedPlan);
  },
  { name: 'api-plan-detail', maxAge: CACHE_MAX_AGE_SECONDS },
);

export default async (event: Parameters<Parameters<typeof defineCachedEventHandler>[0]>[0]) => {
  return runCmsCachedRoute({
    event,
    cacheControl: CACHE_HEADER,
    cachedHandler,
    onUnauthorized: () => normalizePlanDetail(null),
  });
};
