import type { NextRequest } from 'next/server';

import type { GalleryImage } from '@/payload-types';
import { queueMediaDelete } from '@/src/services/mediaLifecycle';

import { corsEmpty } from './cors';
import { isGalleryRouteNotFoundError } from './galleryRouteShared';

type PayloadLike = {
  findByID: (args: any) => Promise<unknown>;
};

type RouteResult<T> = { ok: true; value: T } | { ok: false; response: Response };

export const loadGalleryImageForDelete = async ({
  req,
  payload,
  methods,
  imageId,
}: {
  req: NextRequest;
  payload: PayloadLike;
  methods: string;
  imageId: number;
}): Promise<RouteResult<GalleryImage>> => {
  try {
    const image = (await payload.findByID({
      collection: 'gallery-images',
      id: imageId,
      depth: 0,
      overrideAccess: true,
    })) as GalleryImage;
    return { ok: true, value: image };
  } catch (error) {
    if (isGalleryRouteNotFoundError(error)) {
      return { ok: false, response: corsEmpty(req, methods) };
    }
    throw error;
  }
};

export const queueGalleryDeleteOrNoop = async ({
  req,
  methods,
  payload,
  imageId,
  forceDelete,
  reasonPrefix,
  requestedByUserId,
}: {
  req: NextRequest;
  methods: string;
  payload: unknown;
  imageId: number;
  forceDelete: boolean;
  reasonPrefix: 'mission-gallery' | 'page-gallery';
  requestedByUserId: number | null;
}): Promise<Response | null> => {
  const queued = await queueMediaDelete({
    payload: payload as any,
    assetClass: 'gallery',
    assetId: imageId,
    mode: forceDelete ? 'force' : 'safe',
    reason: forceDelete ? `${reasonPrefix}-force-delete` : `${reasonPrefix}-safe-delete`,
    requestedByUserId,
  });
  if (queued.missingAsset) {
    return corsEmpty(req, methods);
  }
  return null;
};
