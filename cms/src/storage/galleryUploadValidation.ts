import sharp from 'sharp';

import {
  isGalleryImageMimeType,
  isGalleryMimeTypeAllowed,
  resolveGalleryImageMimeTypeFromMetadata,
  resolveGalleryUploadMimeType,
} from './galleryMedia';

export class GalleryUploadValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'GalleryUploadValidationError';
    this.status = status;
  }
}

const formatLimitLabel = (bytes: number): string => {
  const value = bytes / (1024 * 1024);
  const rounded = Number.isInteger(value) ? value.toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${rounded}MB`;
};

export const validateGalleryUploadFile = async ({
  file,
  maxFileSizeBytes,
  allowAudio = true,
}: {
  file: File;
  maxFileSizeBytes: number;
  allowAudio?: boolean;
}): Promise<{ buffer: Buffer<ArrayBufferLike>; mimeType: string }> => {
  if (file.size > maxFileSizeBytes) {
    throw new GalleryUploadValidationError(
      `File exceeds the ${formatLimitLabel(maxFileSizeBytes)} limit.`,
      413,
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer: Buffer<ArrayBufferLike> = Buffer.from(arrayBuffer);
  const uploadMimeType = resolveGalleryUploadMimeType({
    fileType: file.type,
    filename: file.name,
  });

  let metadata: sharp.Metadata | null = null;
  if (!uploadMimeType || isGalleryImageMimeType(uploadMimeType) || !isGalleryMimeTypeAllowed(uploadMimeType)) {
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      metadata = null;
    }
  }

  const inferredImageMime = resolveGalleryImageMimeTypeFromMetadata(metadata?.format);
  const mimeType =
    uploadMimeType && isGalleryMimeTypeAllowed(uploadMimeType)
      ? uploadMimeType
      : inferredImageMime && isGalleryMimeTypeAllowed(inferredImageMime)
        ? inferredImageMime
        : null;

  if (!mimeType) {
    throw new GalleryUploadValidationError(
      'Unsupported file type. Use JPG, PNG, WebP, GIF, AVIF, MP4, WebM, OGG, MOV, MP3, M4A, AAC, WAV, GLB, GLTF, OBJ, STL, FBX, or USDZ.',
    );
  }

  if (!allowAudio && mimeType.startsWith('audio/')) {
    throw new GalleryUploadValidationError('Audio uploads are currently disabled.');
  }

  return { buffer, mimeType };
};
