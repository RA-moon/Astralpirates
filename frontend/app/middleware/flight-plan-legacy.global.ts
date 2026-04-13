import { defineNuxtRouteMiddleware, navigateTo } from '#app';

import { resolveFlightPlanPath } from '~/domains/flightPlans/slug';
import { buildFlightPlanPath } from '~/utils/flightPlans';

const isFlightPlanListing = (path: string): boolean => {
  const trimmed = path.replace(/\/+$/, '') || '/';
  return trimmed === '/flight-plans' || trimmed === '/bridge/flight-plans';
};

const flightPlanRoutePattern = /^\/(?:bridge\/)?flight-plans(?:\/|$)/;

const matchesFlightPlanRoute = (path: string): boolean => flightPlanRoutePattern.test(path);

export default defineNuxtRouteMiddleware((to) => {
  if (!matchesFlightPlanRoute(to.path) || isFlightPlanListing(to.path)) {
    return;
  }

  const resolution = resolveFlightPlanPath(to.path);
  if (!resolution.planSlug) {
    return;
  }

  const canonicalPath = buildFlightPlanPath(resolution.planSlug);
  if (canonicalPath === to.path) {
    return;
  }

  return navigateTo(
    {
      path: canonicalPath,
      query: { ...to.query },
      hash: to.hash || undefined,
    },
    { replace: true, redirectCode: 301 },
  );
});
