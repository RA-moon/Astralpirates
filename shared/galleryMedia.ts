export type GalleryMediaType = 'image' | 'video' | 'audio' | 'model';

export const GALLERY_IMAGE_MIME_TYPES = [
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const GALLERY_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/ogg',
  'video/quicktime',
  'video/webm',
] as const;

export const GALLERY_AUDIO_MIME_TYPES = [
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
] as const;

export const GALLERY_MODEL_MIME_TYPES = [
  'application/vnd.autodesk.fbx',
  'application/x-fbx',
  'model/gltf+json',
  'model/gltf-binary',
  'model/obj',
  'model/stl',
  'model/vnd.fbx',
  'model/vnd.usdz+zip',
] as const;

export const GALLERY_EXTENSION_TO_MIME = new Map<string, string>([
  ['.avif', 'image/avif'],
  ['.gif', 'image/gif'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.m4v', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.mp4', 'video/mp4'],
  ['.aac', 'audio/aac'],
  ['.m4a', 'audio/mp4'],
  ['.mp3', 'audio/mpeg'],
  ['.oga', 'audio/ogg'],
  ['.ogg', 'video/ogg'],
  ['.ogv', 'video/ogg'],
  ['.wav', 'audio/wav'],
  ['.webm', 'video/webm'],
  ['.fbx', 'model/vnd.fbx'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.obj', 'model/obj'],
  ['.stl', 'model/stl'],
  ['.usdz', 'model/vnd.usdz+zip'],
]);

const GALLERY_IMAGE_FORMAT_MIME_TYPES = new Map<string, string>([
  ['avif', 'image/avif'],
  ['gif', 'image/gif'],
  ['jpeg', 'image/jpeg'],
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);

const GALLERY_MODEL_EXTENSION_MIME_FALLBACKS = new Set(['.obj', '.gltf', '.stl']);
const GALLERY_ALLOWED_MEDIA_TYPES = new Set<GalleryMediaType>(['image', 'video', 'audio', 'model']);
const GALLERY_MEDIA_TYPE_BY_PREFIX: Array<[string, GalleryMediaType]> = [
  ['image/', 'image'],
  ['video/', 'video'],
  ['audio/', 'audio'],
  ['model/', 'model'],
];

export const GALLERY_ALLOWED_MIME_TYPES = new Set<string>([
  ...GALLERY_IMAGE_MIME_TYPES,
  ...GALLERY_VIDEO_MIME_TYPES,
  ...GALLERY_AUDIO_MIME_TYPES,
  ...GALLERY_MODEL_MIME_TYPES,
]);

export const GALLERY_ALLOWED_EXTENSIONS = new Set<string>(
  Array.from(GALLERY_EXTENSION_TO_MIME.keys()),
);

export const EMBEDDABLE_MODEL_EXTENSIONS = ['.glb'] as const;
const EMBEDDABLE_MODEL_EXTENSION_SET = new Set<string>(EMBEDDABLE_MODEL_EXTENSIONS);

const trim = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export const normalizeGalleryMimeType = (value: string): string => {
  const lowered = value.toLowerCase().trim();
  if (lowered === 'image/jpg' || lowered === 'image/pjpeg') return 'image/jpeg';
  if (lowered === 'audio/x-m4a') return 'audio/mp4';
  if (lowered === 'audio/x-wav' || lowered === 'audio/wave') return 'audio/wav';
  if (lowered === 'video/x-m4v') return 'video/mp4';
  return lowered;
};

export const extractGalleryFileExtension = (value: unknown): string | null => {
  const input = trim(value);
  if (!input) return null;

  const fromPath = (() => {
    try {
      if (/^https?:\/\//i.test(input)) {
        return new URL(input).pathname;
      }
    } catch {
      // Fall through to direct parsing.
    }
    return input;
  })();

  const filename = fromPath.split('/').pop() ?? '';
  const match = filename.match(/\.[a-z0-9]+$/i);
  if (!match) return null;
  return match[0].toLowerCase();
};

export const isEmbeddableModelUrl = (value: string | null | undefined): boolean => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  const pathname = (() => {
    try {
      return new URL(trimmed, 'https://astralpirates.com').pathname;
    } catch {
      return trimmed;
    }
  })();
  const extension = extractGalleryFileExtension(pathname);
  if (!extension) return false;
  return EMBEDDABLE_MODEL_EXTENSION_SET.has(extension);
};

export const resolveGalleryImageMimeTypeFromMetadata = (
  format: string | undefined,
): string | null => {
  if (!format) return null;
  return GALLERY_IMAGE_FORMAT_MIME_TYPES.get(format.trim().toLowerCase()) ?? null;
};

export const resolveGalleryUploadMimeType = ({
  fileType,
  filename,
}: {
  fileType: string | undefined;
  filename: string | undefined;
}): string | null => {
  const extension = extractGalleryFileExtension(filename);

  if (fileType) {
    const normalized = normalizeGalleryMimeType(fileType);
    if (normalized !== 'application/octet-stream') {
      if (
        extension &&
        GALLERY_MODEL_EXTENSION_MIME_FALLBACKS.has(extension) &&
        !isGalleryMimeTypeAllowed(normalized)
      ) {
        return GALLERY_EXTENSION_TO_MIME.get(extension) ?? normalized;
      }
      return normalized;
    }
  }

  if (!extension) return null;
  return GALLERY_EXTENSION_TO_MIME.get(extension) ?? null;
};

export const isGalleryMimeTypeAllowed = (value: string | null | undefined): boolean => {
  if (!value) return false;
  return GALLERY_ALLOWED_MIME_TYPES.has(normalizeGalleryMimeType(value));
};

export const isGalleryImageMimeType = (value: string | null | undefined): boolean => {
  if (!value) return false;
  return normalizeGalleryMimeType(value).startsWith('image/');
};

export const resolveGalleryMediaTypeFromMime = (
  mimeType: string,
): GalleryMediaType => {
  const normalized = normalizeGalleryMimeType(mimeType);
  if (
    GALLERY_MODEL_MIME_TYPES.includes(
      normalized as (typeof GALLERY_MODEL_MIME_TYPES)[number],
    )
  ) {
    return 'model';
  }
  if (
    GALLERY_VIDEO_MIME_TYPES.includes(
      normalized as (typeof GALLERY_VIDEO_MIME_TYPES)[number],
    )
  ) {
    return 'video';
  }
  if (
    GALLERY_AUDIO_MIME_TYPES.includes(
      normalized as (typeof GALLERY_AUDIO_MIME_TYPES)[number],
    )
  ) {
    return 'audio';
  }
  if (
    GALLERY_IMAGE_MIME_TYPES.includes(
      normalized as (typeof GALLERY_IMAGE_MIME_TYPES)[number],
    )
  ) {
    return 'image';
  }

  for (const [prefix, mediaType] of GALLERY_MEDIA_TYPE_BY_PREFIX) {
    if (normalized.startsWith(prefix)) return mediaType;
  }

  return 'image';
};

const GALLERY_MEDIA_TYPE_BY_EXTENSION = new Map<string, GalleryMediaType>(
  Array.from(GALLERY_EXTENSION_TO_MIME.entries()).map(([extension, mimeType]) => [
    extension,
    resolveGalleryMediaTypeFromMime(mimeType),
  ]),
);

export const normalizeGalleryMediaType = (value: unknown): GalleryMediaType | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!GALLERY_ALLOWED_MEDIA_TYPES.has(normalized as GalleryMediaType)) {
    return null;
  }
  return normalized as GalleryMediaType;
};

export const deduceGalleryMediaType = ({
  mediaType,
  mimeType,
  filename,
  url,
}: {
  mediaType?: unknown;
  mimeType?: unknown;
  filename?: unknown;
  url?: unknown;
}): GalleryMediaType => {
  const explicitType = normalizeGalleryMediaType(mediaType);
  const extensionInferredType = (() => {
    const extension = extractGalleryFileExtension(filename) ?? extractGalleryFileExtension(url);
    if (!extension) return null;
    return GALLERY_MEDIA_TYPE_BY_EXTENSION.get(extension) ?? 'image';
  })();

  const inferredType = (() => {
    if (typeof mimeType === 'string' && mimeType.trim().length > 0) {
      const fromMime = resolveGalleryMediaTypeFromMime(mimeType);
      // Generic MIME values can hide model/video files (e.g. OBJ as text/plain).
      if (fromMime === 'image' && extensionInferredType && extensionInferredType !== 'image') {
        return extensionInferredType;
      }
      return fromMime;
    }

    return extensionInferredType;
  })();

  // Explicit non-image overrides are intentional and should be preserved.
  if (explicitType && explicitType !== 'image') return explicitType;
  // When explicit image conflicts with inferred model/video, prefer inference.
  if (explicitType === 'image') {
    if (inferredType && inferredType !== 'image') {
      return inferredType;
    }
    return 'image';
  }
  if (inferredType) return inferredType;
  return 'image';
};

export const resolveGalleryFilenameExtension = (
  filename: string | null | undefined,
  fallbackMimeType?: string | null,
): string => {
  const fromName = extractGalleryFileExtension(filename);
  if (fromName && GALLERY_ALLOWED_EXTENSIONS.has(fromName)) {
    return fromName === '.jpeg' ? '.jpg' : fromName;
  }
  if (fallbackMimeType) {
    const mime = normalizeGalleryMimeType(fallbackMimeType);
    for (const [extension, mappedMime] of GALLERY_EXTENSION_TO_MIME.entries()) {
      if (mappedMime === mime) {
        return extension === '.jpeg' ? '.jpg' : extension;
      }
    }
  }
  return '.bin';
};
