import {
  isGalleryImageMimeType,
  resolveGalleryUploadMimeType,
} from '~/modules/media/galleryMedia';

export type PreparedGalleryUploadFile = {
  file: File;
  optimized: boolean;
};

const OPTIMIZABLE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const IMAGE_OPTIMIZE_TARGET_LONG_EDGE = 2560;
const IMAGE_OPTIMIZE_MIN_SOURCE_BYTES = 1.2 * 1024 * 1024;
const IMAGE_OPTIMIZE_QUALITY = 0.86;

const resolveExtensionForMime = (mimeType: string): string => {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
};

const replaceFilenameExtension = (name: string, extension: string): string => {
  const trimmed = name.trim();
  const base = trimmed.length > 0 ? trimmed : 'gallery-image';
  const stem = base.replace(/\.[^.]+$/, '');
  return `${stem}${extension}`;
};

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality?: number,
): Promise<Blob | null> =>
  new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });

const optimizeImage = async ({
  file,
  sourceMimeType,
}: {
  file: File;
  sourceMimeType: string;
}): Promise<File | null> => {
  if (typeof window === 'undefined') return null;
  if (typeof document === 'undefined') return null;
  if (typeof createImageBitmap !== 'function') return null;

  const bitmap = await createImageBitmap(file);
  try {
    const sourceLongEdge = Math.max(bitmap.width || 0, bitmap.height || 0);
    if (!Number.isFinite(sourceLongEdge) || sourceLongEdge <= 0) {
      return null;
    }

    const shouldResize = sourceLongEdge > IMAGE_OPTIMIZE_TARGET_LONG_EDGE;
    const shouldCompress = file.size >= IMAGE_OPTIMIZE_MIN_SOURCE_BYTES;
    if (!shouldResize && !shouldCompress) {
      return null;
    }

    const scale = shouldResize ? IMAGE_OPTIMIZE_TARGET_LONG_EDGE / sourceLongEdge : 1;
    const targetWidth = Math.max(1, Math.round(bitmap.width * scale));
    const targetHeight = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    context.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const outputMimeType = sourceMimeType === 'image/png' ? 'image/png' : 'image/webp';
    const outputExtension = resolveExtensionForMime(outputMimeType);
    const blob = await canvasToBlob(canvas, outputMimeType, IMAGE_OPTIMIZE_QUALITY);
    if (!blob || blob.size >= file.size) {
      return null;
    }

    return new File([blob], replaceFilenameExtension(file.name, outputExtension), {
      type: outputMimeType,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close?.();
  }
};

export const prepareGalleryFileForUpload = async (
  file: File,
): Promise<PreparedGalleryUploadFile> => {
  const mimeType = resolveGalleryUploadMimeType(file);
  if (!mimeType || !isGalleryImageMimeType(mimeType)) {
    return { file, optimized: false };
  }

  if (!OPTIMIZABLE_IMAGE_MIME_TYPES.has(mimeType)) {
    return { file, optimized: false };
  }

  try {
    const optimized = await optimizeImage({ file, sourceMimeType: mimeType });
    if (!optimized) {
      return { file, optimized: false };
    }
    return { file: optimized, optimized: true };
  } catch {
    return { file, optimized: false };
  }
};
