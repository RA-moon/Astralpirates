export const LOGBOOK_BASE_PATH = '/bridge/logbook';

const normalisePath = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith('/')) {
    return `/${trimmed.replace(/^\/+/, '')}`;
  }
  return trimmed;
};

export const resolveLogHref = (log: { slug?: string | null; path?: string | null; href?: string | null }) => {
  const path = normalisePath(log.path ?? null);
  if (path && path.startsWith(`${LOGBOOK_BASE_PATH}/`)) {
    return path;
  }

  const href = normalisePath(log.href ?? null);
  if (href && href.startsWith(`${LOGBOOK_BASE_PATH}/`)) {
    return href;
  }

  const slug = (log.slug ?? '').trim();
  if (!slug) {
    return LOGBOOK_BASE_PATH;
  }

  const cleanedSlug = slug.startsWith('/')
    ? slug.replace(/^\/+/, '')
    : slug;

  if (cleanedSlug.startsWith(`${LOGBOOK_BASE_PATH.replace(/^\//, '')}/`)) {
    return `/${cleanedSlug}`;
  }

  return `${LOGBOOK_BASE_PATH}/${cleanedSlug}`;
};

export const TIMESTAMP_SLUG_PATTERN = /^\d{14}$/;

const pad = (value: number) => String(value).padStart(2, '0');

export const formatTimestamp = (date: Date): string => {
  const year = String(date.getUTCFullYear());
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

export const formatLogCode = (log: { dateCode?: string | null; createdAt?: string | null }) => {
  const code = (log.dateCode ?? '').trim();
  if (code) return code;

  const createdAt = log.createdAt ?? '';
  const timestamp = Date.parse(createdAt);
  if (Number.isNaN(timestamp)) {
    return '00000000000000';
  }

  return formatTimestamp(new Date(timestamp));
};

export const buildLogPath = (slug: string): string => `logbook/${slug}`;

export const toTimestampLabel = (date: Date) => {
  const stamp = formatTimestamp(date);
  return {
    stamp,
    slug: stamp,
    path: buildLogPath(stamp),
  };
};

export const timestampSlugToDate = (slug: string): Date | null => {
  if (!TIMESTAMP_SLUG_PATTERN.test(slug)) return null;
  const year = Number(slug.slice(0, 4));
  const month = Number(slug.slice(4, 6));
  const day = Number(slug.slice(6, 8));
  const hours = Number(slug.slice(8, 10));
  const minutes = Number(slug.slice(10, 12));
  const seconds = Number(slug.slice(12, 14));

  if (
    Number.isNaN(year)
    || Number.isNaN(month)
    || Number.isNaN(day)
    || Number.isNaN(hours)
    || Number.isNaN(minutes)
    || Number.isNaN(seconds)
  ) {
    return null;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  if (Number.isNaN(utcDate.getTime())) return null;
  return utcDate;
};

export const deriveCallSignToken = (user: {
  callSign?: string | null;
  profileSlug?: string | null;
  displayName?: string | null;
  email?: string | null;
  id?: number | string | null;
} | null | undefined): string => {
  const candidate =
    user?.callSign?.trim()
    || user?.profileSlug?.trim()
    || user?.displayName?.trim()
    || user?.email?.split('@')[0]
    || (user?.id != null ? `crew-${user.id}` : null);
  const fallback = candidate ? candidate.trim() : 'crew';
  return fallback;
};

const slugifyToken = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const deriveOwnerToken = (user: {
  callSign?: string | null;
  profileSlug?: string | null;
  email?: string | null;
  id?: number | string | null;
} | null | undefined): string => {
  const candidate =
    user?.callSign?.trim()
    || user?.profileSlug?.trim()
    || user?.email?.split('@')[0]
    || (user?.id != null ? `crew-${user.id}` : null);
  const token = candidate ? candidate.trim() : 'crew';
  return slugifyToken(token) || 'crew';
};
