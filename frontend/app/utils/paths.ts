const stripQueryAndHash = (value: string): string => {
  const index = value.search(/[?#]/);
  return index >= 0 ? value.slice(0, index) : value;
};

export const normaliseRoutePath = (value: string | null | undefined): string => {
  if (!value) return '/';
  const trimmed = stripQueryAndHash(value.trim());
  if (!trimmed || trimmed === '/') return '/';
  const withoutLeading = trimmed.replace(/^\/+/, '');
  const withoutTrailing = withoutLeading.replace(/\/+$/, '');
  return withoutTrailing.length ? `/${withoutTrailing}` : '/';
};

export const normaliseContentPath = (value: string | null | undefined): string => {
  if (!value) return '/';
  const trimmed = stripQueryAndHash(value.trim());
  if (!trimmed || trimmed === '/') return '/';
  const withoutLeading = trimmed.replace(/^\/+/, '');
  const withoutTrailing = withoutLeading.replace(/\/+$/, '');
  return withoutTrailing.length ? withoutTrailing : '/';
};
