const DEFAULT_FLIGHT_PLAN_PATH = '/bridge/flight-plans';

const normaliseComparablePath = (value: string): string => {
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? value;
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const collapsed = withLeadingSlash.replace(/\/+/g, '/');
  const trimmed =
    collapsed.length > 1 && collapsed.endsWith('/') ? collapsed.slice(0, -1) : collapsed;
  return trimmed.toLowerCase();
};

const toComparablePath = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      return normaliseComparablePath(parsed.pathname || '/');
    } catch {
      return null;
    }
  }

  return normaliseComparablePath(trimmed);
};

const UNIQUE_REFERENCE_KEYS = new Set(['href', 'path']);

type RewriteResult = {
  value: unknown;
  changed: boolean;
  rewrites: number;
};

const rewriteNode = (
  input: unknown,
  targetPaths: Set<string>,
): RewriteResult => {
  if (Array.isArray(input)) {
    let changed = false;
    let rewrites = 0;
    const next = input.map((entry) => {
      const result = rewriteNode(entry, targetPaths);
      changed = changed || result.changed;
      rewrites += result.rewrites;
      return result.value;
    });
    return {
      value: changed ? next : input,
      changed,
      rewrites,
    };
  }

  if (!input || typeof input !== 'object') {
    return { value: input, changed: false, rewrites: 0 };
  }

  const record = input as Record<string, unknown>;
  let changed = false;
  let rewrites = 0;
  const next: Record<string, unknown> = { ...record };

  for (const [key, value] of Object.entries(record)) {
    if (UNIQUE_REFERENCE_KEYS.has(key)) {
      const comparable = toComparablePath(value);
      if (comparable && targetPaths.has(comparable)) {
        next[key] = DEFAULT_FLIGHT_PLAN_PATH;
        changed = true;
        rewrites += 1;
        continue;
      }
    }

    const nestedResult = rewriteNode(value, targetPaths);
    if (nestedResult.changed) {
      next[key] = nestedResult.value;
      changed = true;
      rewrites += nestedResult.rewrites;
    }
  }

  return {
    value: changed ? next : input,
    changed,
    rewrites,
  };
};

export const buildFlightPlanReferencePathSet = ({
  slug,
  path,
}: {
  slug: string | null;
  path: string | null;
}): Set<string> => {
  const candidates = new Set<string>();

  if (slug) {
    candidates.add(`/bridge/flight-plans/${slug}`);
    candidates.add(`/flight-plans/${slug}`);
    candidates.add(`/events/${slug}`);
  }

  if (path) {
    candidates.add(path);
  }

  const output = new Set<string>();
  for (const candidate of candidates) {
    const comparable = toComparablePath(candidate);
    if (comparable) output.add(comparable);
  }
  return output;
};

export const rewriteLayoutFlightPlanReferences = ({
  layout,
  targetPaths,
}: {
  layout: unknown;
  targetPaths: Set<string>;
}): {
  layout: unknown;
  changed: boolean;
  rewrites: number;
} => {
  if (!targetPaths.size) {
    return { layout, changed: false, rewrites: 0 };
  }

  const rewritten = rewriteNode(layout, targetPaths);
  return {
    layout: rewritten.value,
    changed: rewritten.changed,
    rewrites: rewritten.rewrites,
  };
};

export const shouldClearNavigationSourcePath = ({
  sourcePath,
  targetPaths,
}: {
  sourcePath: unknown;
  targetPaths: Set<string>;
}): boolean => {
  const comparable = toComparablePath(sourcePath);
  if (!comparable) return false;
  return targetPaths.has(comparable);
};
