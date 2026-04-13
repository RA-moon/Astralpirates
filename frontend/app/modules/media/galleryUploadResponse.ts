import type { FlightPlanGalleryAsset } from '~/modules/api/schemas';

export type GalleryUploadPayload = {
  asset: FlightPlanGalleryAsset;
  imageUrl: string;
};

export type GalleryUploadResponse = {
  upload?: Partial<GalleryUploadPayload> | null;
} & Partial<GalleryUploadPayload>;

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
};

export const normalizeGalleryUploadResponse = (
  value: unknown,
): GalleryUploadPayload | null => {
  const root = asRecord(value);
  if (!root) return null;

  const nestedUpload = asRecord(root.upload);
  const source = nestedUpload ?? root;
  const asset = asRecord(source.asset);
  if (!asset) return null;

  const explicitImageUrl =
    typeof source.imageUrl === 'string' ? source.imageUrl.trim() : '';
  const fallbackAssetUrl =
    typeof asset.url === 'string' ? asset.url.trim() : '';
  const imageUrl = explicitImageUrl || fallbackAssetUrl;
  if (!imageUrl) return null;

  return {
    asset: source.asset as FlightPlanGalleryAsset,
    imageUrl,
  };
};
