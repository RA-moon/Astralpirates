import { resolveAstralApiBase } from '~/modules/api/requestFetch';
import { reportClientEvent } from '~/utils/errorReporter';
import {
  AVATAR_MEDIA_PROXY_PATH,
  AVATAR_MEDIA_SOURCE_PREFIXES,
  GALLERY_MEDIA_PROXY_PATH,
  GALLERY_MEDIA_SOURCE_PREFIXES,
  HONOR_BADGE_MEDIA_PROXY_PATH,
  HONOR_BADGE_MEDIA_SOURCE_PREFIXES,
  isGalleryRewriteFallbackHostname,
  isMissingMediaImageFallbackMode,
  isSingleLabelHostname,
  MEDIA_MISSING_FALLBACK_QUERY_KEY,
  MEDIA_MISSING_FALLBACK_QUERY_VALUE_IMAGE,
  shouldTreatHostnameAsInternalMedia,
} from '@astralpirates/shared/mediaUrls';

type UploadAssetLike = {
  filename?: string | null;
  url?: string | null;
} | null | undefined;

const trim = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const isLocalHostname = (value: string): boolean =>
  ['localhost', '127.0.0.1', '::1', '0.0.0.0'].includes(value.toLowerCase());

const encodePathSegments = (value: string): string =>
  value
    .split('/')
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const decodePath = (value: string): string => {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const MEDIA_PROXY_PATH_PREFIXES = [
  GALLERY_MEDIA_PROXY_PATH,
  AVATAR_MEDIA_PROXY_PATH,
  HONOR_BADGE_MEDIA_PROXY_PATH,
] as const;

const isMediaProxyPath = (value: string): boolean =>
  MEDIA_PROXY_PATH_PREFIXES.some((prefix) => value.startsWith(prefix));

const isImageFallbackEligibleProxyPath = (value: string): boolean =>
  value.startsWith(GALLERY_MEDIA_PROXY_PATH) || value.startsWith(AVATAR_MEDIA_PROXY_PATH);

const HONOR_BADGE_INTERNAL_SOURCE_PREFIXES = HONOR_BADGE_MEDIA_SOURCE_PREFIXES.filter(
  (prefix) => prefix !== '/badges/',
);

const resolveRelativeApiBasePrefix = (): string | null => {
  const apiBase = resolveAstralApiBase();
  if (!apiBase || isAbsoluteUrl(apiBase)) return null;
  const trimmed = apiBase.replace(/\/+$/, '');
  if (!trimmed || trimmed === '/') return null;
  return trimmed;
};

const applyRelativeApiBasePrefix = (value: string): string => {
  if (!value.startsWith('/') || !isMediaProxyPath(value)) return value;
  const apiBasePrefix = resolveRelativeApiBasePrefix();
  if (!apiBasePrefix) return value;
  return `${apiBasePrefix}${value}`.replace(/\/{2,}/g, '/');
};

const buildMediaProxyPath = (basePath: string, relativePath: string): string | null => {
  const normalizedRelativePath = trim(relativePath).replace(/^\/+/, '');
  if (!normalizedRelativePath) return null;
  return `${basePath}${encodePathSegments(normalizedRelativePath)}`;
};

const buildGalleryProxyPath = (filename: string): string | null =>
  buildMediaProxyPath(GALLERY_MEDIA_PROXY_PATH, filename);

const withMissingMediaFallback = (value: string | null | undefined): string | null => {
  const trimmed = trim(value);
  if (!trimmed) return null;
  if (isAbsoluteUrl(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (!isMediaProxyPath(parsed.pathname)) return trimmed;
      if (!isImageFallbackEligibleProxyPath(parsed.pathname)) {
        return parsed.toString();
      }
      if (
        isMissingMediaImageFallbackMode(
          parsed.searchParams.get(MEDIA_MISSING_FALLBACK_QUERY_KEY),
        )
      ) {
        return parsed.toString();
      }
      parsed.searchParams.set(
        MEDIA_MISSING_FALLBACK_QUERY_KEY,
        MEDIA_MISSING_FALLBACK_QUERY_VALUE_IMAGE,
      );
      return parsed.toString();
    } catch {
      return trimmed;
    }
  }

  if (!isMediaProxyPath(trimmed)) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed, 'http://localhost');
    if (!isImageFallbackEligibleProxyPath(parsed.pathname)) {
      return applyRelativeApiBasePrefix(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    }
    if (
      isMissingMediaImageFallbackMode(
        parsed.searchParams.get(MEDIA_MISSING_FALLBACK_QUERY_KEY),
      )
    ) {
      return applyRelativeApiBasePrefix(`${parsed.pathname}${parsed.search}${parsed.hash}`);
    }
    parsed.searchParams.set(
      MEDIA_MISSING_FALLBACK_QUERY_KEY,
      MEDIA_MISSING_FALLBACK_QUERY_VALUE_IMAGE,
    );
    return applyRelativeApiBasePrefix(`${parsed.pathname}${parsed.search}${parsed.hash}`);
  } catch {
    return trimmed;
  }
};

const parseHostname = (value: string): string | null => {
  if (!isAbsoluteUrl(value)) return null;
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const toPathname = (value: string): string | null => {
  if (!value) return null;
  try {
    return isAbsoluteUrl(value)
      ? new URL(value).pathname
      : new URL(value, 'http://localhost').pathname;
  } catch {
    return null;
  }
};

const reportGalleryRewriteFallback = ({
  hostname,
  imageType,
  sourceUrl,
  resolvedUrl,
  hasAssetFilename,
}: {
  hostname: string;
  imageType: 'upload' | 'url';
  sourceUrl: string;
  resolvedUrl: string | null;
  hasAssetFilename: boolean;
}) => {
  reportClientEvent({
    message: 'gallery-url-rewrite-fallback',
    component: 'galleryUrls',
    level: 'warn',
    meta: {
      hostname,
      imageType,
      hasAssetFilename,
      sourcePath: toPathname(sourceUrl),
      resolvedPath: resolvedUrl ? toPathname(resolvedUrl) : null,
    },
  });
};

const extractRelativePathFromPrefixes = (
  pathname: string,
  prefixes: readonly string[],
): string | null => {
  for (const prefix of prefixes) {
    const matchIndex = pathname.indexOf(prefix);
    if (matchIndex === -1) continue;
    const relativePath = pathname.slice(matchIndex + prefix.length).replace(/^\/+/, '');
    if (!relativePath) continue;
    return decodePath(relativePath);
  }

  return null;
};

const extractFilenameFromGalleryUrl = (value: string): string | null => {
  const pathname = toPathname(value);
  if (!pathname) return null;
  return extractRelativePathFromPrefixes(pathname, GALLERY_MEDIA_SOURCE_PREFIXES);
};

const resolveKnownInternalMediaProxyPath = (value: string): string | null => {
  const pathname = toPathname(value);
  if (!pathname) return null;

  const galleryPath = extractRelativePathFromPrefixes(pathname, GALLERY_MEDIA_SOURCE_PREFIXES);
  if (galleryPath) {
    return buildMediaProxyPath(GALLERY_MEDIA_PROXY_PATH, galleryPath);
  }

  const avatarPath = extractRelativePathFromPrefixes(pathname, AVATAR_MEDIA_SOURCE_PREFIXES);
  if (avatarPath) {
    return buildMediaProxyPath(AVATAR_MEDIA_PROXY_PATH, avatarPath);
  }

  const honorBadgePath = extractRelativePathFromPrefixes(
    pathname,
    HONOR_BADGE_INTERNAL_SOURCE_PREFIXES,
  );
  if (honorBadgePath) {
    return buildMediaProxyPath(HONOR_BADGE_MEDIA_PROXY_PATH, honorBadgePath);
  }

  return null;
};

const shouldRewriteAbsoluteInternalMedia = (host: string | null): boolean => {
  if (!host) return false;
  return shouldTreatHostnameAsInternalMedia(host);
};

export const normalizeInternalMediaUrl = (
  value: string | null | undefined,
): string | null => {
  const trimmed = trim(value);
  if (!trimmed) return null;

  const normalizedProxyPath = resolveKnownInternalMediaProxyPath(trimmed);
  if (!isAbsoluteUrl(trimmed)) {
    return withMissingMediaFallback(normalizedProxyPath ?? trimmed);
  }

  const host = parseHostname(trimmed);
  if (normalizedProxyPath && shouldRewriteAbsoluteInternalMedia(host)) {
    return withMissingMediaFallback(normalizedProxyPath);
  }

  return trimmed;
};

export const buildCmsGalleryFileUrl = (filename: string): string | null => {
  const filePath = buildGalleryProxyPath(filename);
  if (!filePath) return null;
  const apiBase = resolveAstralApiBase();
  if (!apiBase) return filePath;

  if (isAbsoluteUrl(apiBase)) {
    try {
      const parsed = new URL(apiBase);
      if (isSingleLabelHostname(parsed.hostname) && !isLocalHostname(parsed.hostname)) {
        parsed.hostname = 'localhost';
      }
      const normalizedBase = `${parsed.protocol}//${parsed.host}`.replace(/\/+$/, '');
      return `${normalizedBase}${filePath}`;
    } catch {
      return `${apiBase.replace(/\/+$/, '')}${filePath}`;
    }
  }

  const trimmedBase = apiBase.replace(/\/+$/, '');
  if (!trimmedBase || trimmedBase === '/') return filePath;
  return `${trimmedBase}${filePath}`.replace(/\/{2,}/g, '/');
};

export const resolveGalleryUploadDisplayUrl = ({
  imageType,
  imageUrl,
  asset,
}: {
  imageType: 'upload' | 'url';
  imageUrl: string | null | undefined;
  asset?: UploadAssetLike;
}): string | null => {
  const assetUrl = trim(asset?.url);
  const sourceUrl = trim(imageUrl);
  const directUrl = imageType === 'upload' ? assetUrl || sourceUrl : sourceUrl || assetUrl;
  const fallbackFilenameFromAsset = trim(asset?.filename);
  const fallbackFilename = fallbackFilenameFromAsset || extractFilenameFromGalleryUrl(directUrl);
  const fallbackPath = fallbackFilename ? withMissingMediaFallback(buildGalleryProxyPath(fallbackFilename)) : null;
  const fallbackUrl = fallbackFilename ? buildCmsGalleryFileUrl(fallbackFilename) : null;
  const normalizedDirectUrl = normalizeInternalMediaUrl(directUrl);
  const hostname = parseHostname(directUrl);
  const normalizedInternalProxyPath =
    normalizedDirectUrl && normalizedDirectUrl.startsWith('/api/') ? normalizedDirectUrl : null;
  if (normalizedInternalProxyPath) {
    const rewrittenUrl = withMissingMediaFallback(normalizedInternalProxyPath);
    if (imageType !== 'upload' && hostname && isGalleryRewriteFallbackHostname(hostname)) {
      reportGalleryRewriteFallback({
        hostname,
        imageType,
        sourceUrl: directUrl,
        resolvedUrl: rewrittenUrl,
        hasAssetFilename: Boolean(fallbackFilenameFromAsset),
      });
    }
    return rewrittenUrl;
  }

  // Normalize known non-resolving media hosts back to the same-origin proxy path,
  // even if the slide metadata says imageType=url.
  if (hostname && isGalleryRewriteFallbackHostname(hostname) && fallbackFilename) {
    const rewrittenUrl = fallbackPath || fallbackUrl || directUrl;
    if (imageType !== 'upload') {
      reportGalleryRewriteFallback({
        hostname,
        imageType,
        sourceUrl: directUrl,
        resolvedUrl: rewrittenUrl,
        hasAssetFilename: Boolean(fallbackFilenameFromAsset),
      });
    }
    return rewrittenUrl;
  }

  if (imageType === 'upload' && fallbackFilenameFromAsset) {
    return fallbackPath || fallbackUrl || normalizedDirectUrl || directUrl || null;
  }

  if (imageType !== 'upload') {
    return directUrl || null;
  }

  if (!directUrl) return fallbackUrl;
  if (!fallbackFilename) return directUrl;

  return directUrl;
};
