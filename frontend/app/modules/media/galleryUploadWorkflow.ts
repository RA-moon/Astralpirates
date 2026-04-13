import {
  deduceGalleryMediaType,
  GALLERY_UPLOAD_MAX_FILE_SIZE_BYTES,
  GALLERY_UPLOAD_MAX_FILE_SIZE_LABEL,
  isGalleryMimeTypeAllowed,
  resolveGalleryUploadMimeType,
  type GalleryMediaType,
} from './galleryMedia';
import { prepareGalleryFileForUpload } from './galleryImagePreparation';

export const GALLERY_UPLOAD_UNSUPPORTED_TYPE_MESSAGE =
  'Unsupported file type. Use image, video, audio, or 3D model files.';
export const GALLERY_UPLOAD_FAILED_MESSAGE = 'Upload failed. Try again.';

export type PreparedGalleryUploadCandidate = {
  sourceFile: File;
  uploadFile: File;
};

export const deriveGalleryMediaTitle = (filename: string): string => {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  const words = withoutExt.replace(/[-_]+/g, ' ').trim();
  return words.length ? words : 'Mission media';
};

export const validateGalleryUploadFile = (file: File): string | null => {
  if (file.size > GALLERY_UPLOAD_MAX_FILE_SIZE_BYTES) {
    return `File exceeds the ${GALLERY_UPLOAD_MAX_FILE_SIZE_LABEL} limit.`;
  }

  const mimeType = resolveGalleryUploadMimeType(file);
  if (!mimeType || !isGalleryMimeTypeAllowed(mimeType)) {
    return GALLERY_UPLOAD_UNSUPPORTED_TYPE_MESSAGE;
  }

  return null;
};

export const prepareGalleryUploadCandidate = async (
  sourceFile: File,
): Promise<{ candidate: PreparedGalleryUploadCandidate | null; error: string | null }> => {
  const prepared = await prepareGalleryFileForUpload(sourceFile);
  const validationError = validateGalleryUploadFile(prepared.file);
  if (validationError) {
    return { candidate: null, error: validationError };
  }
  return {
    candidate: {
      sourceFile,
      uploadFile: prepared.file,
    },
    error: null,
  };
};

export const resolveUploadedGalleryMediaType = ({
  currentMediaType,
  assetMimeType,
  assetFilename,
  imageUrl,
}: {
  currentMediaType?: unknown;
  assetMimeType?: string | null | undefined;
  assetFilename?: string | null | undefined;
  imageUrl?: string | null | undefined;
}): GalleryMediaType =>
  deduceGalleryMediaType({
    mediaType: currentMediaType,
    mimeType: assetMimeType ?? undefined,
    filename: assetFilename ?? undefined,
    url: imageUrl ?? undefined,
  });
