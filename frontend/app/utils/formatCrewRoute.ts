export const formatCrewRoute = (input?: string | null): string | null => {
  if (!input) return null;

  const trimmed = input.trim();
  if (!trimmed) return null;

  const withoutSuffix = trimmed.replace(/[?#].*$/, '');
  const withoutTrailingSlashes = withoutSuffix.replace(/\/+$/, '');
  const cleaned = withoutTrailingSlashes.replace(/^\/+/, '');

  if (!cleaned) return 'bridge';

  const segments = cleaned.split('/').filter((segment) => segment.length > 0);
  if (!segments.length) return 'bridge';

  const lastSegment = segments[segments.length - 1] ?? '';
  if (!lastSegment.length) return 'bridge';

  return decodeURIComponent(lastSegment);
};
