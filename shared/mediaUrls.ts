const normalizeHostname = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const normalizeBucketName = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/^\/+|\/+$/g, '');
  return normalized.length > 0 ? normalized : null;
};

const normalizeQueryValue = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const toHostname = (value: string | null | undefined): string | null => {
  const normalized = normalizeHostname(value);
  if (!normalized) return null;
  const candidate = normalized.includes('://') ? normalized : `https://${normalized}`;
  try {
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return null;
  }
};

export const ARTIFACT_MEDIA_HOSTNAME = 'artifact.astralpirates.com' as const;
export const CMS_MEDIA_HOSTNAME = 'cms.astralpirates.com' as const;

export const INTERNAL_MEDIA_HOSTNAMES = [
  'astralpirates.com',
  'www.astralpirates.com',
  'cms.astralpirates.com',
  'artifact.astralpirates.com',
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
] as const;

const INTERNAL_MEDIA_HOSTNAME_SET = new Set<string>(INTERNAL_MEDIA_HOSTNAMES);

export const isKnownInternalMediaHostname = (value: string | null | undefined): boolean => {
  const normalized = toHostname(value) ?? normalizeHostname(value);
  return normalized != null && INTERNAL_MEDIA_HOSTNAME_SET.has(normalized);
};

export const isArtifactMediaHostname = (value: string | null | undefined): boolean =>
  (toHostname(value) ?? normalizeHostname(value)) === ARTIFACT_MEDIA_HOSTNAME;

export const GALLERY_REWRITE_FALLBACK_HOSTNAMES = [
  CMS_MEDIA_HOSTNAME,
  ARTIFACT_MEDIA_HOSTNAME,
] as const;

const GALLERY_REWRITE_FALLBACK_HOSTNAME_SET = new Set<string>(GALLERY_REWRITE_FALLBACK_HOSTNAMES);

export const isGalleryRewriteFallbackHostname = (
  value: string | null | undefined,
): boolean => {
  const normalized = toHostname(value) ?? normalizeHostname(value);
  return normalized != null && GALLERY_REWRITE_FALLBACK_HOSTNAME_SET.has(normalized);
};

export const isSingleLabelHostname = (value: string | null | undefined): boolean => {
  const normalized = normalizeHostname(value);
  return normalized != null && !normalized.includes('.');
};

export const shouldTreatHostnameAsInternalMedia = (
  value: string | null | undefined,
): boolean => isKnownInternalMediaHostname(value) || isSingleLabelHostname(value);

export const GALLERY_MEDIA_PROXY_PATH = '/api/gallery-images/file/';
export const AVATAR_MEDIA_PROXY_PATH = '/api/avatars/file/';
export const TASK_ATTACHMENT_MEDIA_PROXY_PATH = '/api/task-attachments/file/';
export const HONOR_BADGE_MEDIA_PROXY_PATH = '/api/honor-badge-media/file/';

export const MEDIA_DEFAULT_BUCKETS = {
  avatars: 'avatars',
  gallery: 'gallery',
  tasks: 'tasks',
  badges: 'badges',
  matrix: 'matrix-media',
  videos: 'videos',
  models: 'models',
  documents: 'documents',
} as const;

export const resolveMediaBucketName = (
  value: string | null | undefined,
  fallback: string,
): string => normalizeBucketName(value) ?? fallback;

export const MEDIA_MISSING_FALLBACK_QUERY_KEY = 'fallback' as const;
export const MEDIA_MISSING_FALLBACK_QUERY_VALUE_IMAGE = 'image' as const;

type UrlSearchParamsLike = {
  get: (name: string) => string | null;
};

export const resolveMissingMediaFallbackMode = (
  searchParams: UrlSearchParamsLike | null | undefined,
): string | null =>
  normalizeQueryValue(searchParams?.get(MEDIA_MISSING_FALLBACK_QUERY_KEY) ?? null);

export const isMissingMediaImageFallbackMode = (
  value: string | null | undefined,
): boolean =>
  normalizeQueryValue(value) === MEDIA_MISSING_FALLBACK_QUERY_VALUE_IMAGE;

export const GALLERY_MEDIA_SOURCE_PREFIXES = [
  GALLERY_MEDIA_PROXY_PATH,
  '/media/gallery/',
  '/gallery/',
] as const;

export const AVATAR_MEDIA_SOURCE_PREFIXES = [
  AVATAR_MEDIA_PROXY_PATH,
  '/media/avatars/',
  '/avatars/',
] as const;

export const TASK_ATTACHMENT_MEDIA_SOURCE_PREFIXES = [
  TASK_ATTACHMENT_MEDIA_PROXY_PATH,
  '/media/tasks/',
  '/tasks/',
] as const;

export const HONOR_BADGE_MEDIA_SOURCE_PREFIXES = [
  HONOR_BADGE_MEDIA_PROXY_PATH,
  '/media/badges/',
  '/badges/',
] as const;

export type GalleryCanonicalMode = 'proxy' | 'direct';

export const buildGalleryCanonicalModeStartupWarning = ({
  mediaProvider,
  mediaBaseUrl,
  payloadServerUrl,
  canonicalMode,
}: {
  mediaProvider: string | null | undefined;
  mediaBaseUrl: string | null | undefined;
  payloadServerUrl: string | null | undefined;
  canonicalMode?: GalleryCanonicalMode;
}): string | null => {
  const provider = normalizeHostname(mediaProvider);
  if (provider !== 'seaweedfs') return null;

  const mode = canonicalMode ?? 'proxy';
  if (mode !== 'proxy') return null;

  const mediaHost = toHostname(mediaBaseUrl);
  const payloadHost = toHostname(payloadServerUrl);
  if (!mediaHost || !payloadHost || mediaHost === payloadHost) return null;

  return `[media-hostname-resilience] Canonical gallery mode "${mode}" expects same-origin proxy URLs (${GALLERY_MEDIA_PROXY_PATH}*), but MEDIA_BASE_URL host (${mediaHost}) differs from PAYLOAD_PUBLIC_SERVER_URL host (${payloadHost}).`;
};
