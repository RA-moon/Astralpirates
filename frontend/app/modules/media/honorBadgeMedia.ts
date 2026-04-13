import {
  deduceAvatarMediaType,
  extractAvatarFilenameFromUrl,
  resolveAvatarMimeTypeFromFilename,
  type AvatarMediaType,
} from '@astralpirates/shared/avatarMedia';
import { isEmbeddableAvatarModelUrl } from './avatarMedia';
import { normalizeInternalMediaUrl } from './galleryUrls';

export type HonorBadgeMediaType = AvatarMediaType;

export type HonorBadgeMediaRecordInput = {
  iconUrl?: string | null;
  iconMediaUrl?: string | null;
  iconMimeType?: string | null;
  iconFilename?: string | null;
};

export type HonorBadgeMediaRecord = {
  iconUrl: string | null;
  iconMediaUrl: string | null;
  iconMimeType: string | null;
  iconFilename: string | null;
  iconMediaType: HonorBadgeMediaType;
};

const trimToNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeHonorBadgeUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  return normalizeInternalMediaUrl(value) ?? trimToNull(value);
};

export const normalizeHonorBadgeMediaRecord = (
  input: HonorBadgeMediaRecordInput,
): HonorBadgeMediaRecord => {
  const iconUrl = normalizeHonorBadgeUrl(input.iconUrl);
  const iconMediaUrl = normalizeHonorBadgeUrl(input.iconMediaUrl) ?? iconUrl;
  const iconFilename =
    trimToNull(input.iconFilename) ??
    extractAvatarFilenameFromUrl(iconMediaUrl ?? iconUrl);
  const iconMimeType =
    trimToNull(input.iconMimeType) ??
    resolveAvatarMimeTypeFromFilename(iconFilename);
  const iconMediaType = deduceAvatarMediaType({
    mimeType: iconMimeType,
    filename: iconFilename,
    url: iconMediaUrl ?? iconUrl,
  });

  return {
    iconUrl,
    iconMediaUrl,
    iconMimeType,
    iconFilename,
    iconMediaType,
  };
};

export const isEmbeddableHonorBadgeModelUrl = (
  value: string | null | undefined,
): boolean => isEmbeddableAvatarModelUrl(value);
