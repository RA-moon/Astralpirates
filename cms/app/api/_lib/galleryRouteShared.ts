import type { GalleryImage } from '@/payload-types';
import {
  deduceGalleryMediaType,
  resolveGalleryUploadMimeType,
} from '@/src/storage/galleryMedia';

import { resolveGalleryAssetUrl } from './content';

export const summarizeGalleryUploadFile = (candidate: unknown) => {
  if (!(candidate instanceof File)) {
    return {
      isFile: false,
      receivedType: candidate === null ? 'null' : typeof candidate,
    };
  }

  const inferredMimeType = resolveGalleryUploadMimeType({
    fileType: candidate.type,
    filename: candidate.name,
  });
  const mediaType = deduceGalleryMediaType({
    mimeType: inferredMimeType ?? candidate.type,
    filename: candidate.name,
  });

  return {
    isFile: true,
    name: candidate.name || null,
    type: candidate.type || null,
    size: Number.isFinite(candidate.size) ? candidate.size : null,
    inferredMimeType: inferredMimeType ?? null,
    mediaType,
    isAudioMedia: mediaType === 'audio',
  };
};

export const extractPublicGalleryUploadError = (
  error: unknown,
): { status: number; message: string } | null => {
  if (!error || typeof error !== 'object') return null;

  const record = error as {
    status?: unknown;
    isPublic?: unknown;
    message?: unknown;
    data?: { errors?: Array<{ message?: unknown }> } | unknown;
  };

  const status =
    typeof record.status === 'number' &&
    Number.isFinite(record.status) &&
    record.status >= 400 &&
    record.status < 500
      ? record.status
      : null;
  if (!status || record.isPublic !== true) return null;

  const firstNestedMessage = Array.isArray((record.data as { errors?: unknown })?.errors)
    ? (record.data as { errors: Array<{ message?: unknown }> }).errors
        .map((entry) =>
          typeof entry?.message === 'string' ? entry.message.trim() : '',
        )
        .find((value) => value.length > 0) ?? ''
    : '';
  const directMessage =
    typeof record.message === 'string' ? record.message.trim() : '';
  const message = firstNestedMessage || directMessage;
  if (!message) return null;

  return { status, message };
};

export const isGalleryRouteNotFoundError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const record = error as {
    status?: unknown;
    statusCode?: unknown;
    message?: unknown;
    data?: { status?: unknown };
  };
  const statusCandidates = [record.status, record.statusCode, record.data?.status]
    .map((value) => Number.parseInt(String(value ?? ''), 10))
    .filter((value) => Number.isFinite(value));
  if (statusCandidates.includes(404)) return true;
  const message = typeof record.message === 'string' ? record.message.trim().toLowerCase() : '';
  return message === 'not found' || message.includes('not found');
};

export const isForceGalleryDeleteRequested = (searchParams: URLSearchParams): boolean => {
  const rawValue = searchParams.get('force');
  if (!rawValue) return false;
  const value = rawValue.trim().toLowerCase();
  return value === '1' || value === 'true' || value === 'yes';
};

export type SerializedGalleryImageAsset = {
  id: number;
  url: string | null;
  width: number | null;
  height: number | null;
  mimeType: string | null;
  filesize: number | null;
  thumbnailUrl: string | null;
  filename: string | null;
};

export const serializeGalleryImageAsset = (
  doc: GalleryImage,
): SerializedGalleryImageAsset => ({
  id: doc.id,
  url: resolveGalleryAssetUrl(doc),
  width: doc.sizes?.preview?.width ?? doc.width ?? null,
  height: doc.sizes?.preview?.height ?? doc.height ?? null,
  mimeType: doc.mimeType ?? null,
  filesize: doc.filesize ?? null,
  thumbnailUrl: doc.sizes?.thumbnail?.url ?? doc.thumbnailURL ?? null,
  filename: doc.filename ?? null,
});
