import { computed } from 'vue';
import { useRoute } from '#imports';
import { buildFlightPlanPath } from '~/utils/flightPlans';

export type FlightPlanSlugResolution = {
  segments: string[];
  filteredSegments: string[];
  ownerSlug: string | null;
  planSlug: string | null;
};

export const resolveFlightPlanPath = (path: string): FlightPlanSlugResolution => {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  const segments = trimmed
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  const filteredSegments = (() => {
    const prefixes = new Set(['bridge', 'flight-plans', 'events']);
    const result = [...segments];
    while (result.length && prefixes.has(result[0]?.toLowerCase() ?? '')) {
      result.shift();
    }
    return result;
  })();

  const planSlug = filteredSegments.at(-1) ?? null;
  const ownerSlug = filteredSegments.length >= 2 ? filteredSegments.at(-2) ?? null : null;

  return {
    segments,
    filteredSegments,
    ownerSlug,
    planSlug,
  };
};

export const useFlightPlanSlug = () => {
  const route = useRoute();
  const resolved = computed(() => resolveFlightPlanPath(route.path));

  const planSlug = computed(() => resolved.value.planSlug);
  const ownerSlug = computed(() => resolved.value.ownerSlug);
  const canonicalPath = computed(() => {
    const slug = planSlug.value;
    if (!slug) return null;
    return buildFlightPlanPath(slug);
  });

  return {
    planSlug,
    ownerSlug,
    canonicalPath,
    segments: computed(() => resolved.value.filteredSegments),
  };
};
