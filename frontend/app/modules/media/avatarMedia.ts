import {
  AVATAR_ALLOWED_MIME_TYPES,
  deduceAvatarMediaType,
  extractAvatarFilenameFromUrl,
  resolveAvatarMimeTypeFromFilename,
  resolveAvatarUploadMimeType as resolveAvatarUploadMimeTypeFromInput,
  type AvatarMediaType,
} from '@astralpirates/shared/avatarMedia';
import {
  GALLERY_ALLOWED_EXTENSIONS,
  GALLERY_EXTENSION_TO_MIME,
  isEmbeddableModelUrl,
} from '@astralpirates/shared/galleryMedia';
import { normalizeAvatarUrl } from '~/modules/media/avatarUrls';
import { formatMegabyteLabel, parsePositiveIntFromEnv } from '~/modules/media/uploadLimits';

export type { AvatarMediaType };

export type AvatarMediaRecordInput = {
  avatarUrl?: string | null | undefined;
  avatarMediaType?: unknown;
  avatarMediaUrl?: string | null | undefined;
  avatarMimeType?: string | null | undefined;
  avatarFilename?: string | null | undefined;
};

export type AvatarMediaRecord = {
  avatarUrl: string | null;
  avatarMediaType: AvatarMediaType;
  avatarMediaUrl: string | null;
  avatarMimeType: string | null;
  avatarFilename: string | null;
};

const DEFAULT_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

const resolveAvatarUploadLimit = (): number => {
  const candidates: Array<unknown> = [
    import.meta.env?.NUXT_PUBLIC_MEDIA_MAX_UPLOAD_AVATAR_BYTES,
    import.meta.env?.MEDIA_MAX_UPLOAD_AVATAR_BYTES,
    process.env.NUXT_PUBLIC_MEDIA_MAX_UPLOAD_AVATAR_BYTES,
    process.env.MEDIA_MAX_UPLOAD_AVATAR_BYTES,
  ];

  for (const candidate of candidates) {
    const parsed = parsePositiveIntFromEnv(candidate);
    if (parsed != null) {
      return parsed;
    }
  }

  return DEFAULT_AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES;
};

const AVATAR_ALLOWED_EXTENSIONS = Array.from(GALLERY_ALLOWED_EXTENSIONS)
  .filter((extension) => {
    const mimeType = GALLERY_EXTENSION_TO_MIME.get(extension);
    return Boolean(mimeType && AVATAR_ALLOWED_MIME_TYPES.has(mimeType));
  })
  .sort((left, right) => left.localeCompare(right));

export const AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES = resolveAvatarUploadLimit();

export const AVATAR_UPLOAD_MAX_FILE_SIZE_LABEL = formatMegabyteLabel(
  AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
);

export const AVATAR_FILE_ACCEPT = [
  ...AVATAR_ALLOWED_EXTENSIONS,
  ...Array.from(AVATAR_ALLOWED_MIME_TYPES).sort((left, right) => left.localeCompare(right)),
].join(',');

export const AVATAR_EXTERNAL_MEDIA_TYPE_OPTIONS: Array<{ label: string; value: AvatarMediaType }> = [
  { label: 'Image', value: 'image' },
  { label: 'Video', value: 'video' },
  { label: '3D model', value: 'model' },
];

const trimToNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const resolveAvatarFilename = ({
  avatarFilename,
  avatarMediaUrl,
  avatarUrl,
}: {
  avatarFilename: string | null;
  avatarMediaUrl: string | null;
  avatarUrl: string | null;
}): string | null => {
  const explicitFilename = trimToNull(avatarFilename);
  if (explicitFilename) return explicitFilename;
  return extractAvatarFilenameFromUrl(avatarMediaUrl ?? avatarUrl ?? null);
};

export const normalizeAvatarMediaRecord = (
  input: AvatarMediaRecordInput,
): AvatarMediaRecord => {
  const avatarUrl = normalizeAvatarUrl(input.avatarUrl ?? null);
  const avatarMediaUrl =
    normalizeAvatarUrl(input.avatarMediaUrl ?? null) ??
    avatarUrl;

  const avatarFilename = resolveAvatarFilename({
    avatarFilename: trimToNull(input.avatarFilename),
    avatarMediaUrl,
    avatarUrl,
  });

  const avatarMimeType =
    trimToNull(input.avatarMimeType) ??
    resolveAvatarMimeTypeFromFilename(avatarFilename);

  const avatarMediaType = deduceAvatarMediaType({
    mediaType: input.avatarMediaType,
    mimeType: avatarMimeType,
    filename: avatarFilename,
    url: avatarMediaUrl ?? avatarUrl,
  });

  return {
    avatarUrl,
    avatarMediaType,
    avatarMediaUrl,
    avatarMimeType,
    avatarFilename,
  };
};

export const resolveAvatarUploadMimeType = (file: File): string | null =>
  resolveAvatarUploadMimeTypeFromInput({
    fileType: file.type,
    filename: file.name,
  });

export const isEmbeddableAvatarModelUrl = (value: string | null | undefined): boolean => {
  return isEmbeddableModelUrl(value);
};

export type AvatarUploadValidationResult =
  | { ok: true; mimeType: string; mediaType: AvatarMediaType }
  | { ok: false; error: string };

export const validateAvatarUploadFile = (file: File): AvatarUploadValidationResult => {
  if (file.size > AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      error: `Avatar exceeds the ${AVATAR_UPLOAD_MAX_FILE_SIZE_LABEL} limit.`,
    };
  }

  const mimeType = resolveAvatarUploadMimeType(file);
  if (!mimeType) {
    return {
      ok: false,
      error: 'Unsupported avatar format. Upload an image, video, or supported 3D model (GLB/GLTF/OBJ/STL/FBX/USDZ).',
    };
  }

  return {
    ok: true,
    mimeType,
    mediaType: deduceAvatarMediaType({
      mimeType,
      filename: file.name,
    }),
  };
};
