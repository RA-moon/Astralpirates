import fs from 'node:fs';
import path from 'node:path';

import type { Payload } from 'payload';
import {
  MEDIA_COLLECTION_ORIGINS,
  MEDIA_COLLECTION_PATHNAMES,
  MEDIA_STORAGE_PROVIDER,
} from '@/src/storage/mediaConfig';
import { resolveMediaLocalRoots } from '../../_lib/mediaFileRoute';
import {
  AVATAR_MEDIA_PROXY_PATH,
  AVATAR_MEDIA_SOURCE_PREFIXES,
  isKnownInternalMediaHostname,
} from '@astralpirates/shared/mediaUrls';
import {
  deduceAvatarMediaType,
  extractAvatarFilenameFromUrl,
  normalizeAvatarMediaType,
  resolveAvatarMimeTypeFromFilename,
  type AvatarMediaType,
} from '@astralpirates/shared/avatarMedia';

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const LEGACY_AVATAR_STATIC_PATH = trimTrailingSlash(AVATAR_MEDIA_SOURCE_PREFIXES[1]);
export const AVATAR_STATIC_PATH = MEDIA_COLLECTION_PATHNAMES.avatars || LEGACY_AVATAR_STATIC_PATH;
const AVATAR_STATIC_PREFIX = AVATAR_STATIC_PATH.replace(/\/$/, '');
const LEGACY_AVATAR_STATIC_PREFIX = LEGACY_AVATAR_STATIC_PATH.replace(/\/$/, '');
const PUBLIC_AVATAR_BUCKET_PREFIX = trimTrailingSlash(AVATAR_MEDIA_SOURCE_PREFIXES[2]);
const PUBLIC_AVATAR_BUCKET_PREFIX_NO_SLASH = PUBLIC_AVATAR_BUCKET_PREFIX.replace(/^\//, '');

const AVATAR_STATIC_PREFIXES = Array.from(
  new Set([AVATAR_STATIC_PREFIX, LEGACY_AVATAR_STATIC_PREFIX].filter(Boolean)),
).sort((a, b) => b.length - a.length);

const PREFERRED_AVATAR_STATIC_PREFIX =
  MEDIA_STORAGE_PROVIDER === 'seaweedfs' ? AVATAR_STATIC_PREFIX : LEGACY_AVATAR_STATIC_PREFIX;

const AVATAR_MEDIA_DIRS = resolveMediaLocalRoots('avatars');

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const API_FILE_PREFIX = AVATAR_MEDIA_PROXY_PATH;
const API_FILE_PREFIX_NO_SLASH = API_FILE_PREFIX.replace(/^\//, '');

const isCompatPublicBucketPath = (value: string): boolean => {
  if (value === PUBLIC_AVATAR_BUCKET_PREFIX) return true;
  return value.startsWith(`${PUBLIC_AVATAR_BUCKET_PREFIX}/`);
};

const findAvatarStaticPrefix = (value: string): string | null => {
  for (const prefix of AVATAR_STATIC_PREFIXES) {
    if (value === prefix || value.startsWith(`${prefix}/`)) {
      return prefix;
    }
  }
  return null;
};

const resolveAllowedOrigins = (payload: Payload | null | undefined): Set<string> => {
  const allowed = new Set<string>();
  const serverCandidates = [
    payload?.config?.serverURL,
    process.env.PAYLOAD_PUBLIC_SERVER_URL,
    process.env.FRONTEND_ORIGIN,
  ];
  for (const candidate of serverCandidates) {
    if (!candidate) continue;
    try {
      allowed.add(new URL(candidate).origin);
    } catch {
      continue;
    }
  }
  if (MEDIA_COLLECTION_ORIGINS.avatars) {
    allowed.add(MEDIA_COLLECTION_ORIGINS.avatars);
  }
  return allowed;
};

const rewriteApiFilePrefix = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  const prefixIndex = trimmed.indexOf(API_FILE_PREFIX);
  if (prefixIndex !== -1) {
    const suffix = trimmed.slice(prefixIndex + API_FILE_PREFIX.length).replace(/^\/+/, '');
    return `${API_FILE_PREFIX}${suffix}`;
  }

  if (trimmed.startsWith(API_FILE_PREFIX_NO_SLASH)) {
    const suffix = trimmed.slice(API_FILE_PREFIX_NO_SLASH.length).replace(/^\/+/, '');
    return `${API_FILE_PREFIX}${suffix}`;
  }

  return trimmed;
};

const rewritePublicBucketPrefix = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  if (isCompatPublicBucketPath(trimmed)) {
    const suffix = trimmed.slice(PUBLIC_AVATAR_BUCKET_PREFIX.length).replace(/^\/+/, '');
    return `${PREFERRED_AVATAR_STATIC_PREFIX}/${suffix}`.replace(/\/{2,}/g, '/');
  }

  if (trimmed.startsWith(PUBLIC_AVATAR_BUCKET_PREFIX_NO_SLASH)) {
    const suffix = trimmed.slice(PUBLIC_AVATAR_BUCKET_PREFIX_NO_SLASH.length).replace(/^\/+/, '');
    return `${PREFERRED_AVATAR_STATIC_PREFIX}/${suffix}`.replace(/\/{2,}/g, '/');
  }

  return trimmed;
};

const normaliseAvatarPath = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (isAbsoluteUrl(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      parsed.pathname = rewriteApiFilePrefix(parsed.pathname);
      parsed.pathname = rewritePublicBucketPrefix(parsed.pathname);
      return parsed.href;
    } catch {
      return trimmed;
    }
  }

  const maybePrefixed = rewriteApiFilePrefix(trimmed);
  const maybePublicBucket = rewritePublicBucketPrefix(maybePrefixed);
  if (maybePublicBucket.startsWith('/')) return maybePublicBucket;
  if (maybePublicBucket.startsWith('media/')) return `/${maybePublicBucket}`;
  if (maybePublicBucket.startsWith('avatars/')) {
    return `${PREFERRED_AVATAR_STATIC_PREFIX}/${maybePublicBucket.replace(/^\/+/, '')}`;
  }
  return `${API_FILE_PREFIX}/${maybePublicBucket.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
};

const toRelativeAvatarPath = (candidate: string, payload: Payload | null | undefined): string | null => {
  const trimmed = candidate.trim();
  if (!trimmed) return null;

  let value = trimmed;

  if (isAbsoluteUrl(value)) {
    try {
      const parsed = new URL(value);
      const allowedOrigins = resolveAllowedOrigins(payload);
      const parsedHost = parsed.hostname.toLowerCase();
      const isKnownInternalOrigin = isKnownInternalMediaHostname(parsedHost);
      const isCompatAvatarPath =
        parsed.pathname.startsWith(API_FILE_PREFIX) ||
        findAvatarStaticPrefix(parsed.pathname) != null ||
        isCompatPublicBucketPath(parsed.pathname);
      if (
        allowedOrigins.size > 0 &&
        !allowedOrigins.has(parsed.origin) &&
        !(isCompatAvatarPath && isKnownInternalOrigin)
      ) {
        return null;
      }
      value = rewritePublicBucketPrefix(parsed.pathname);
    } catch {
      return null;
    }
  }

  value = rewriteApiFilePrefix(value);
  value = rewritePublicBucketPrefix(value);

  if (value.startsWith(API_FILE_PREFIX)) {
    value = `${PREFERRED_AVATAR_STATIC_PREFIX}/${value
      .slice(API_FILE_PREFIX.length)
      .replace(/^\/+/, '')}`;
  }

  if (!value.startsWith('/')) {
    if (value.startsWith('media/')) {
      value = `/${value}`;
    } else if (value.startsWith('avatars/')) {
      value = `${PREFERRED_AVATAR_STATIC_PREFIX}/${value.replace(/^\/+/, '')}`;
    } else {
      value = `/${value}`;
    }
  }

  value = rewriteApiFilePrefix(value);

  const matchedPrefix = findAvatarStaticPrefix(value);
  if (!matchedPrefix) {
    return null;
  }

  const relative = value.slice(matchedPrefix.length).replace(/^\/+/, '');
  return relative || null;
};

const normalizeRelativePathCandidate = (value: string): string | null => {
  const posixPath = value.replaceAll('\\', '/');
  const normalized = path.posix.normalize(posixPath);
  if (!normalized || normalized === '.' || normalized.startsWith('/')) {
    return null;
  }
  if (normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    return null;
  }
  return normalized;
};

const avatarFileExists = (relativePath: string): boolean => {
  const candidates = new Set<string>([relativePath]);

  try {
    const decoded = decodeURIComponent(relativePath);
    if (decoded) {
      candidates.add(decoded);
    }
  } catch {
    // ignore malformed URI sequences
  }

  if (relativePath.includes('+')) {
    candidates.add(relativePath.replace(/\+/g, ' '));
  }

  for (const candidate of candidates) {
    const safeRelative = normalizeRelativePathCandidate(candidate);
    if (!safeRelative) {
      continue;
    }
    for (const baseDir of AVATAR_MEDIA_DIRS) {
      const fullPath = path.resolve(baseDir, safeRelative);
      if (fullPath !== baseDir && !fullPath.startsWith(`${baseDir}${path.sep}`)) {
        continue;
      }
      try {
        fs.accessSync(fullPath, fs.constants.R_OK);
        return true;
      } catch {
        continue;
      }
    }
  }

  return false;
};

const toAbsoluteUrl = (
  payload: Payload | null | undefined,
  value: string | null | undefined,
): string | null => {
  if (typeof value !== 'string') return null;
  const normalisedPath = normaliseAvatarPath(value);
  if (!normalisedPath) return null;

  const relative = toRelativeAvatarPath(normalisedPath, payload);
  if (MEDIA_STORAGE_PROVIDER === 'local' && relative && !avatarFileExists(relative)) {
    return null;
  }

  const usesLegacyOrConfiguredStaticPath =
    normalisedPath.startsWith('/') && Boolean(findAvatarStaticPrefix(normalisedPath));
  const prefersApiPath =
    usesLegacyOrConfiguredStaticPath || normalisedPath.startsWith(API_FILE_PREFIX) || isAbsoluteUrl(normalisedPath);
  const outputPath = relative
    ? prefersApiPath
      ? `${API_FILE_PREFIX}${relative.replace(/^\/+/, '')}`
      : normalisedPath
    : normalisedPath;

  if (isAbsoluteUrl(outputPath)) {
    return outputPath;
  }

  const serverUrl = payload?.config?.serverURL ?? process.env.PAYLOAD_PUBLIC_SERVER_URL ?? null;
  if (!serverUrl) {
    return outputPath;
  }

  try {
    return new URL(outputPath, serverUrl).href;
  } catch {
    return outputPath;
  }
};

export const resolveAvatarUrlFromValue = (
  payload: Payload | null | undefined,
  value: string | null | undefined,
): string | null => toAbsoluteUrl(payload, value);

export const resolveAvatarUrlFromUpload = (
  payload: Payload | null | undefined,
  uploadDoc: unknown,
): string | null => {
  if (!uploadDoc || typeof uploadDoc !== 'object') return null;
  const entry = uploadDoc as { url?: unknown; filename?: unknown };

  const direct = resolveAvatarUrlFromValue(payload, typeof entry.url === 'string' ? entry.url : null);
  if (direct) return direct;

  if (typeof entry.filename === 'string') {
    return resolveAvatarUrlFromValue(payload, `${API_FILE_PREFIX}${entry.filename}`);
  }

  return null;
};

const resolveUploadFilename = (uploadDoc: unknown): string | null => {
  if (!uploadDoc || typeof uploadDoc !== 'object') return null;
  const raw = (uploadDoc as { filename?: unknown }).filename;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const resolveUploadMimeType = (uploadDoc: unknown): string | null => {
  if (!uploadDoc || typeof uploadDoc !== 'object') return null;
  const raw = (uploadDoc as { mimeType?: unknown }).mimeType;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export type AvatarMediaMetadata = {
  avatarUrl: string | null;
  avatarMediaType: AvatarMediaType;
  avatarMediaUrl: string | null;
  avatarMimeType: string | null;
  avatarFilename: string | null;
};

export const resolveAvatarMediaMetadata = ({
  payload,
  uploadDoc,
  avatarUrl,
  avatarMediaType,
}: {
  payload: Payload | null | undefined;
  uploadDoc?: unknown;
  avatarUrl?: string | null | undefined;
  avatarMediaType?: unknown;
}): AvatarMediaMetadata => {
  const resolvedFromUpload = resolveAvatarUrlFromUpload(payload, uploadDoc);
  const resolvedFromValue = resolveAvatarUrlFromValue(payload, avatarUrl ?? null);
  const resolvedUrl = resolvedFromUpload ?? resolvedFromValue;
  const resolvedFilename =
    resolveUploadFilename(uploadDoc) ?? extractAvatarFilenameFromUrl(resolvedUrl ?? avatarUrl ?? null);
  const resolvedMimeType =
    resolveUploadMimeType(uploadDoc) ??
    resolveAvatarMimeTypeFromFilename(resolvedFilename) ??
    null;

  const normalizedExplicitType = normalizeAvatarMediaType(avatarMediaType);
  const finalType = deduceAvatarMediaType({
    mediaType: normalizedExplicitType ?? avatarMediaType,
    mimeType: resolvedMimeType ?? undefined,
    filename: resolvedFilename ?? undefined,
    url: resolvedUrl ?? avatarUrl ?? undefined,
  });

  return {
    avatarUrl: resolvedUrl,
    avatarMediaType: finalType,
    avatarMediaUrl: resolvedUrl,
    avatarMimeType: resolvedMimeType,
    avatarFilename: resolvedFilename ?? null,
  };
};
