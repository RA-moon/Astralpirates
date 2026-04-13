import {
  GALLERY_ALLOWED_EXTENSIONS,
  GALLERY_ALLOWED_MIME_TYPES,
  deduceGalleryMediaType,
  isGalleryImageMimeType,
  isGalleryMimeTypeAllowed,
  normalizeGalleryMediaType,
  resolveGalleryFilenameExtension,
  resolveGalleryImageMimeTypeFromMetadata,
  resolveGalleryMediaTypeFromMime,
  resolveGalleryUploadMimeType,
  type GalleryMediaType,
} from '@astralpirates/shared/galleryMedia';

export type { GalleryMediaType };

export {
  GALLERY_ALLOWED_EXTENSIONS,
  GALLERY_ALLOWED_MIME_TYPES,
  deduceGalleryMediaType,
  isGalleryImageMimeType,
  isGalleryMimeTypeAllowed,
  normalizeGalleryMediaType,
  resolveGalleryFilenameExtension,
  resolveGalleryImageMimeTypeFromMetadata,
  resolveGalleryMediaTypeFromMime,
  resolveGalleryUploadMimeType,
};

const MODEL_STORAGE_FALLBACK_MIME_TYPES = [
  // Payload resolves some 3D extensions (notably .obj/.stl) to generic MIME values.
  'application/sla',
  'application/vnd.ms-pki.stl',
  'text/plain',
] as const;

export const GALLERY_STORAGE_MIME_TYPES = new Set<string>([
  ...GALLERY_ALLOWED_MIME_TYPES,
  ...MODEL_STORAGE_FALLBACK_MIME_TYPES,
]);
