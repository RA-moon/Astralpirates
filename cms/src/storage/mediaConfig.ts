import path from 'node:path';
import { cwd } from 'node:process';
import {
  MEDIA_DEFAULT_BUCKETS,
  resolveMediaBucketName,
} from '@astralpirates/shared/mediaUrls';

export type MediaStorageProvider = 'local' | 'seaweedfs';
export type MediaCollectionKey = 'avatars' | 'gallery' | 'tasks' | 'badges';

const DEFAULT_MEDIA_PROVIDER: MediaStorageProvider = 'local';
const DEFAULT_MEDIA_LIMITS_BYTES = {
  avatar: 2 * 1024 * 1024,
  gallery: 25 * 1024 * 1024,
  taskAttachment: 25 * 1024 * 1024,
  badge: 2 * 1024 * 1024,
} as const;
const LOCAL_MEDIA_STATIC_URLS = {
  avatars: '/media/avatars',
  gallery: '/media/gallery',
  tasks: '/media/tasks',
  badges: '/media/badges',
} as const;
const DEFAULT_MEDIA_BUCKETS = {
  avatars: 'avatars',
  gallery: 'gallery',
  tasks: 'tasks',
  badges: 'badges',
} as const;

const normalizeOptionalString = (value: string | undefined | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const parsePositiveInt = (value: string | undefined | null, fallback: number): number => {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return fallback;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const parseProvider = (value: string | undefined | null): MediaStorageProvider => {
  const normalized = normalizeOptionalString(value)?.toLowerCase();
  if (normalized === 'seaweedfs') return 'seaweedfs';
  return DEFAULT_MEDIA_PROVIDER;
};

const stripTrailingSlashes = (value: string): string => value.replace(/\/+$/, '');

const isAbsoluteHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const joinUrl = (base: string, suffix: string | null | undefined): string => {
  const normalizedSuffix = (normalizeOptionalString(suffix) ?? '').replace(/^\/+/, '');
  if (!normalizedSuffix) return stripTrailingSlashes(base);
  if (isAbsoluteHttpUrl(base)) {
    try {
      return new URL(normalizedSuffix, `${stripTrailingSlashes(base)}/`).toString();
    } catch {
      // fall back to path join behavior below
    }
  }
  const normalizedBase = stripTrailingSlashes(base);
  if (!normalizedBase) return `/${normalizedSuffix}`;
  if (normalizedBase === '/') return `/${normalizedSuffix}`;
  return `${normalizedBase}/${normalizedSuffix}`;
};

const toPathname = (value: string): string => {
  if (!value) return value;
  if (!isAbsoluteHttpUrl(value)) return value;
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
};

const resolveOrigin = (value: string): string | null => {
  if (!isAbsoluteHttpUrl(value)) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const provider = parseProvider(process.env.MEDIA_STORAGE_PROVIDER);
const payloadServerUrl =
  normalizeOptionalString(process.env.PAYLOAD_PUBLIC_SERVER_URL) ?? 'http://localhost:3000';
const mediaBaseUrl =
  normalizeOptionalString(process.env.MEDIA_BASE_URL) ??
  `${stripTrailingSlashes(payloadServerUrl)}/media`;

const buckets = {
  avatars: resolveMediaBucketName(
    process.env.MEDIA_BUCKET_AVATARS,
    MEDIA_DEFAULT_BUCKETS.avatars ?? DEFAULT_MEDIA_BUCKETS.avatars,
  ),
  gallery: resolveMediaBucketName(
    process.env.MEDIA_BUCKET_GALLERY,
    MEDIA_DEFAULT_BUCKETS.gallery ?? DEFAULT_MEDIA_BUCKETS.gallery,
  ),
  tasks: resolveMediaBucketName(
    process.env.MEDIA_BUCKET_TASKS,
    MEDIA_DEFAULT_BUCKETS.tasks ?? DEFAULT_MEDIA_BUCKETS.tasks,
  ),
  badges: resolveMediaBucketName(
    process.env.MEDIA_BUCKET_BADGES,
    MEDIA_DEFAULT_BUCKETS.badges ?? DEFAULT_MEDIA_BUCKETS.badges,
  ),
} as const;

const galleryLegacyStaticUrl =
  normalizeOptionalString(process.env.GALLERY_STATIC_URL) ?? LOCAL_MEDIA_STATIC_URLS.gallery;

const staticUrls =
  provider === 'seaweedfs'
    ? {
        avatars: joinUrl(mediaBaseUrl, buckets.avatars),
        gallery: joinUrl(mediaBaseUrl, buckets.gallery),
        tasks: joinUrl(mediaBaseUrl, buckets.tasks),
        badges: joinUrl(mediaBaseUrl, buckets.badges),
      }
    : {
        avatars: LOCAL_MEDIA_STATIC_URLS.avatars,
        gallery: galleryLegacyStaticUrl,
        tasks: LOCAL_MEDIA_STATIC_URLS.tasks,
        badges: LOCAL_MEDIA_STATIC_URLS.badges,
      };

export const MEDIA_STORAGE_PROVIDER: MediaStorageProvider = provider;
export const MEDIA_BASE_URL = mediaBaseUrl;
export const MEDIA_BUCKETS = buckets;
export const MEDIA_LIMITS_BYTES = {
  avatar: parsePositiveInt(
    process.env.MEDIA_MAX_UPLOAD_AVATAR_BYTES,
    DEFAULT_MEDIA_LIMITS_BYTES.avatar,
  ),
  gallery: parsePositiveInt(
    process.env.MEDIA_MAX_UPLOAD_GALLERY_BYTES,
    DEFAULT_MEDIA_LIMITS_BYTES.gallery,
  ),
  taskAttachment: parsePositiveInt(
    process.env.MEDIA_MAX_UPLOAD_TASK_BYTES,
    DEFAULT_MEDIA_LIMITS_BYTES.taskAttachment,
  ),
  badge: parsePositiveInt(
    process.env.MEDIA_MAX_UPLOAD_BADGE_BYTES,
    DEFAULT_MEDIA_LIMITS_BYTES.badge,
  ),
} as const;

export const MEDIA_COLLECTION_CONFIG = {
  avatars: {
    staticDir: path.resolve(cwd(), 'public/media/avatars'),
    staticURL: staticUrls.avatars,
    maxFileSize: MEDIA_LIMITS_BYTES.avatar,
    bucket: buckets.avatars,
  },
  gallery: {
    staticDir: path.resolve(cwd(), 'public/media/gallery'),
    staticURL: staticUrls.gallery,
    maxFileSize: MEDIA_LIMITS_BYTES.gallery,
    bucket: buckets.gallery,
  },
  tasks: {
    staticDir: path.resolve(cwd(), 'public/media/tasks'),
    staticURL: staticUrls.tasks,
    maxFileSize: MEDIA_LIMITS_BYTES.taskAttachment,
    bucket: buckets.tasks,
  },
  badges: {
    staticDir: path.resolve(cwd(), 'public/media/badges'),
    staticURL: staticUrls.badges,
    maxFileSize: MEDIA_LIMITS_BYTES.badge,
    bucket: buckets.badges,
  },
} as const;

export const MEDIA_COLLECTION_PATHNAMES = {
  avatars: stripTrailingSlashes(toPathname(MEDIA_COLLECTION_CONFIG.avatars.staticURL)) || '/',
  gallery: stripTrailingSlashes(toPathname(MEDIA_COLLECTION_CONFIG.gallery.staticURL)) || '/',
  tasks: stripTrailingSlashes(toPathname(MEDIA_COLLECTION_CONFIG.tasks.staticURL)) || '/',
  badges: stripTrailingSlashes(toPathname(MEDIA_COLLECTION_CONFIG.badges.staticURL)) || '/',
} as const;

export const MEDIA_COLLECTION_ORIGINS = {
  avatars: resolveOrigin(MEDIA_COLLECTION_CONFIG.avatars.staticURL),
  gallery: resolveOrigin(MEDIA_COLLECTION_CONFIG.gallery.staticURL),
  tasks: resolveOrigin(MEDIA_COLLECTION_CONFIG.tasks.staticURL),
  badges: resolveOrigin(MEDIA_COLLECTION_CONFIG.badges.staticURL),
} as const;

export const buildMediaFileUrl = (
  mediaClass: MediaCollectionKey,
  filename: string | null | undefined,
): string | null => {
  const normalizedFilename = normalizeOptionalString(filename);
  if (!normalizedFilename) return null;
  const base = MEDIA_COLLECTION_CONFIG[mediaClass].staticURL;
  const normalizedBase = stripTrailingSlashes(base);
  const normalizedFile = normalizedFilename.replace(/^\/+/, '');
  if (!normalizedBase) return `/${normalizedFile}`;
  return joinUrl(normalizedBase, normalizedFile);
};
