import type { FlightPlanSummary } from '~/modules/api/schemas';

type FlightPlanSource =
  | string
  | (Partial<Pick<FlightPlanSummary, 'slug' | 'href' | 'owner'>> & {
      path?: string | null;
    });

const cleanString = (value: string | null | undefined): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const cleanSegment = (value: string): string => {
  const trimmed = cleanString(value);
  return trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
};

const splitSegments = (value: string): string[] => {
  const cleaned = cleanString(value);
  if (!cleaned) return [];
  return cleaned
    .split('/')
    .map((segment) => cleanSegment(segment))
    .filter((segment) => segment.length > 0);
};

const stripCollectionPrefixes = (segments: string[]): string[] => {
  const blocked = new Set(['flight-plans', 'events']);
  return segments.filter((segment) => !blocked.has(segment));
};

const collectCandidateSegments = (source: FlightPlanSource): string[][] => {
  if (typeof source === 'string') {
    return [stripCollectionPrefixes(splitSegments(source)), splitSegments(source)];
  }

  const candidates: string[][] = [];
  const values: Array<string | null | undefined> = [source.slug, source.path, source.href];

  values.forEach((value) => {
    const segments = splitSegments(value ?? '');
    if (segments.length > 0) {
      const filtered = stripCollectionPrefixes(segments);
      if (filtered.length > 0) {
        candidates.push(filtered);
      }
      candidates.push(segments);
    }
  });

  if (candidates.length === 0) {
    candidates.push([]);
  }

  return candidates;
};

export const extractFlightPlanSlug = (source: FlightPlanSource): string => {
  const candidates = collectCandidateSegments(source);
  for (const segments of candidates) {
    if (segments.length > 0) {
      return cleanSegment(segments[segments.length - 1] ?? '');
    }
  }
  return '';
};

export const buildFlightPlanPath = (slug: string, _ownerSlug?: string | null): string => {
  const cleanedSlug = cleanSegment(slug);
  if (!cleanedSlug) return '/bridge/flight-plans';
  return `/bridge/flight-plans/${cleanedSlug}`;
};

export const resolveFlightPlanHref = (source: FlightPlanSource): string => {
  const slug = extractFlightPlanSlug(source);
  return buildFlightPlanPath(slug);
};
