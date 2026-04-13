import {
  GALLERY_ALLOWED_EXTENSIONS,
  GALLERY_ALLOWED_MIME_TYPES,
  deduceGalleryMediaType,
  isGalleryImageMimeType,
  isGalleryMimeTypeAllowed,
  normalizeGalleryMediaType,
  resolveGalleryMediaTypeFromMime,
  resolveGalleryUploadMimeType as resolveGalleryUploadMimeTypeFromInput,
  type GalleryMediaType,
} from '@astralpirates/shared/galleryMedia';
import { formatMegabyteLabel, parsePositiveIntFromEnv } from '~/modules/media/uploadLimits';

export type { GalleryMediaType };

export {
  deduceGalleryMediaType,
  isGalleryImageMimeType,
  isGalleryMimeTypeAllowed,
  normalizeGalleryMediaType,
  resolveGalleryMediaTypeFromMime,
};

const DEFAULT_GALLERY_UPLOAD_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

const resolveGalleryUploadLimit = (): number => {
  const candidates: Array<unknown> = [
    import.meta.env?.NUXT_PUBLIC_MEDIA_MAX_UPLOAD_GALLERY_BYTES,
    import.meta.env?.MEDIA_MAX_UPLOAD_GALLERY_BYTES,
    process.env.NUXT_PUBLIC_MEDIA_MAX_UPLOAD_GALLERY_BYTES,
    process.env.MEDIA_MAX_UPLOAD_GALLERY_BYTES,
  ];
  for (const candidate of candidates) {
    const parsed = parsePositiveIntFromEnv(candidate);
    if (parsed != null) {
      return parsed;
    }
  }
  return DEFAULT_GALLERY_UPLOAD_MAX_FILE_SIZE_BYTES;
};

export const GALLERY_UPLOAD_MAX_FILE_SIZE_BYTES = resolveGalleryUploadLimit();
export const GALLERY_UPLOAD_MAX_FILE_SIZE_LABEL = formatMegabyteLabel(
  GALLERY_UPLOAD_MAX_FILE_SIZE_BYTES,
);
export const GALLERY_FILE_ACCEPT = [
  ...Array.from(GALLERY_ALLOWED_EXTENSIONS).sort((left, right) => left.localeCompare(right)),
  ...Array.from(GALLERY_ALLOWED_MIME_TYPES).sort((left, right) => left.localeCompare(right)),
].join(',');

export const resolveGalleryUploadMimeType = (file: File): string | null =>
  resolveGalleryUploadMimeTypeFromInput({
    fileType: file.type,
    filename: file.name,
  });
