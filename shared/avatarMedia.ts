import {
  GALLERY_EXTENSION_TO_MIME,
  GALLERY_IMAGE_MIME_TYPES,
  GALLERY_MODEL_MIME_TYPES,
  GALLERY_VIDEO_MIME_TYPES,
  extractGalleryFileExtension,
  normalizeGalleryMimeType,
  resolveGalleryMediaTypeFromMime,
  resolveGalleryUploadMimeType,
} from './galleryMedia';

export const AVATAR_MEDIA_TYPES = ['image', 'video', 'model'] as const;
export type AvatarMediaType = (typeof AVATAR_MEDIA_TYPES)[number];

export const AVATAR_IMAGE_MIME_TYPES = [...GALLERY_IMAGE_MIME_TYPES] as const;
export const AVATAR_VIDEO_MIME_TYPES = [...GALLERY_VIDEO_MIME_TYPES] as const;
export const AVATAR_MODEL_MIME_TYPES = [...GALLERY_MODEL_MIME_TYPES] as const;

export const AVATAR_ALLOWED_MIME_TYPES = new Set<string>([
  ...AVATAR_IMAGE_MIME_TYPES,
  ...AVATAR_VIDEO_MIME_TYPES,
  ...AVATAR_MODEL_MIME_TYPES,
]);

const AVATAR_MEDIA_TYPE_SET = new Set<AvatarMediaType>(AVATAR_MEDIA_TYPES);

const trim = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const normalizeAvatarMediaType = (value: unknown): AvatarMediaType | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!AVATAR_MEDIA_TYPE_SET.has(normalized as AvatarMediaType)) return null;
  return normalized as AvatarMediaType;
};

export const isAvatarImageMimeType = (value: string | null | undefined): boolean => {
  if (!value) return false;
  return normalizeGalleryMimeType(value).startsWith('image/');
};

export const isAvatarMimeTypeAllowed = (value: string | null | undefined): boolean => {
  if (!value) return false;
  return AVATAR_ALLOWED_MIME_TYPES.has(normalizeGalleryMimeType(value));
};

export const resolveAvatarMediaTypeFromMime = (
  mimeType: string | null | undefined,
): AvatarMediaType | null => {
  if (!mimeType) return null;
  const normalized = normalizeGalleryMimeType(mimeType);
  const galleryType = resolveGalleryMediaTypeFromMime(normalized);
  if (galleryType === 'video' || galleryType === 'model' || galleryType === 'image') {
    return galleryType;
  }
  return null;
};

const AVATAR_MEDIA_TYPE_BY_EXTENSION = new Map<string, AvatarMediaType>(
  Array.from(GALLERY_EXTENSION_TO_MIME.entries()).reduce<Array<[string, AvatarMediaType]>>(
    (acc, [extension, mimeType]) => {
      const mediaType = resolveAvatarMediaTypeFromMime(mimeType);
      if (mediaType) acc.push([extension, mediaType]);
      return acc;
    },
    [],
  ),
);

export const resolveAvatarUploadMimeType = ({
  fileType,
  filename,
}: {
  fileType: string | undefined;
  filename: string | undefined;
}): string | null => {
  const candidate = resolveGalleryUploadMimeType({ fileType, filename });
  if (!candidate) return null;
  const normalized = normalizeGalleryMimeType(candidate);
  return AVATAR_ALLOWED_MIME_TYPES.has(normalized) ? normalized : null;
};

export const deduceAvatarMediaType = ({
  mediaType,
  mimeType,
  filename,
  url,
}: {
  mediaType?: unknown;
  mimeType?: unknown;
  filename?: unknown;
  url?: unknown;
}): AvatarMediaType => {
  const explicitType = normalizeAvatarMediaType(mediaType);
  const extensionInferredType = (() => {
    const extension = extractGalleryFileExtension(filename) ?? extractGalleryFileExtension(url);
    if (!extension) return null;
    return AVATAR_MEDIA_TYPE_BY_EXTENSION.get(extension) ?? 'image';
  })();

  const inferredType = (() => {
    if (typeof mimeType === 'string' && mimeType.trim().length > 0) {
      const fromMime = resolveAvatarMediaTypeFromMime(mimeType) ?? 'image';
      if (fromMime === 'image' && extensionInferredType && extensionInferredType !== 'image') {
        return extensionInferredType;
      }
      return fromMime;
    }

    return extensionInferredType;
  })();

  if (explicitType && explicitType !== 'image') return explicitType;
  if (explicitType === 'image') {
    if (inferredType && inferredType !== 'image') {
      return inferredType;
    }
    return 'image';
  }
  if (inferredType) return inferredType;
  return 'image';
};

export const extractAvatarFilenameFromUrl = (
  value: string | null | undefined,
): string | null => {
  const raw = trim(value);
  if (!raw) return null;
  const pathname = (() => {
    try {
      return new URL(raw, 'http://localhost').pathname;
    } catch {
      return raw;
    }
  })();
  const segment = pathname.split('/').pop() ?? '';
  const cleaned = segment.trim();
  if (!cleaned) return null;
  try {
    return decodeURIComponent(cleaned);
  } catch {
    return cleaned;
  }
};

export const resolveAvatarMimeTypeFromFilename = (
  filename: string | null | undefined,
): string | null => {
  const extension = extractGalleryFileExtension(filename);
  if (!extension) return null;
  const resolved = GALLERY_EXTENSION_TO_MIME.get(extension);
  if (!resolved) return null;
  return isAvatarMimeTypeAllowed(resolved) ? resolved : null;
};

export const resolveAvatarFilenameExtension = (
  filename: string | null | undefined,
  fallbackMimeType?: string | null,
): string => {
  const fromName = extractGalleryFileExtension(filename);
  if (fromName && GALLERY_EXTENSION_TO_MIME.has(fromName)) {
    const mapped = GALLERY_EXTENSION_TO_MIME.get(fromName);
    if (mapped && isAvatarMimeTypeAllowed(mapped)) {
      return fromName === '.jpeg' ? '.jpg' : fromName;
    }
  }

  if (fallbackMimeType) {
    const normalizedMime = normalizeGalleryMimeType(fallbackMimeType);
    for (const [extension, mappedMime] of GALLERY_EXTENSION_TO_MIME.entries()) {
      if (mappedMime === normalizedMime && isAvatarMimeTypeAllowed(mappedMime)) {
        return extension === '.jpeg' ? '.jpg' : extension;
      }
    }
  }

  return '.jpg';
};
