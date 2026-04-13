import { normalizeInternalMediaUrl } from '~/modules/media/galleryUrls';
import {
  AVATAR_MEDIA_PROXY_PATH,
  isMissingMediaImageFallbackMode,
  MEDIA_MISSING_FALLBACK_QUERY_KEY,
} from '@astralpirates/shared/mediaUrls';

export const AVATAR_FALLBACK_IMAGE_URL = '/assets/images/astralpirates.png';

const trim = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const isAvatarProxyPath = (pathname: string): boolean => pathname.includes(AVATAR_MEDIA_PROXY_PATH);

const stripAvatarMissingMediaFallback = (value: string): string => {
  const trimmed = trim(value);
  if (!trimmed) return trimmed;

  if (isAbsoluteUrl(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (
        !isAvatarProxyPath(parsed.pathname) ||
        !isMissingMediaImageFallbackMode(
          parsed.searchParams.get(MEDIA_MISSING_FALLBACK_QUERY_KEY),
        )
      ) {
        return parsed.toString();
      }
      parsed.searchParams.delete(MEDIA_MISSING_FALLBACK_QUERY_KEY);
      return parsed.toString();
    } catch {
      return trimmed;
    }
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (
      !isAvatarProxyPath(parsed.pathname) ||
      !isMissingMediaImageFallbackMode(
        parsed.searchParams.get(MEDIA_MISSING_FALLBACK_QUERY_KEY),
      )
    ) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    parsed.searchParams.delete(MEDIA_MISSING_FALLBACK_QUERY_KEY);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return trimmed;
  }
};

export const normalizeAvatarUrl = (value: string | null | undefined): string | null => {
  const normalized = normalizeInternalMediaUrl(value);
  if (typeof normalized === 'string' && normalized.length > 0) {
    return stripAvatarMissingMediaFallback(normalized);
  }
  const raw = trim(value);
  return raw.length > 0 ? raw : null;
};

export const hasAvatarUrl = (value: string | null | undefined): boolean =>
  Boolean(normalizeAvatarUrl(value));

export const resolveAvatarDisplayUrl = (value: string | null | undefined): string =>
  normalizeAvatarUrl(value) ?? AVATAR_FALLBACK_IMAGE_URL;
