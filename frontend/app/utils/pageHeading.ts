const DEFAULT_HEADING = 'Airlock';
const PATH_TITLE_OVERRIDES: Record<string, string> = {
  '/': DEFAULT_HEADING,
};

const capitalize = (value: string) =>
  value.length ? value.charAt(0).toUpperCase() + value.slice(1) : value;

export const formatPathToHeading = (path: string): string => {
  const fallback = PATH_TITLE_OVERRIDES['/'] ?? DEFAULT_HEADING;
  if (!path || path === '/') return fallback;
  const cleaned = path.replace(/^\//, '').replace(/\/$/, '');
  if (!cleaned) return fallback;
  const segments = cleaned.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  if (!last) return fallback;
  return last
    .split('-')
    .filter(Boolean)
    .map((part) => capitalize(part))
    .join(' ') || fallback;
};

export const resolveFallbackHeading = (options: {
  pageTitle?: string | null;
  navigationLabel?: string | null;
  hasHeroHeading?: boolean;
  path: string;
}): string | null => {
  const { pageTitle, navigationLabel, hasHeroHeading = false, path } = options;
  const base =
    (navigationLabel ?? '').trim() ||
    (pageTitle ?? '').trim() ||
    formatPathToHeading(path);
  if (!base) return null;
  return hasHeroHeading ? null : base;
};
