import { randomBytes } from 'node:crypto';
import path from 'path';

import type { Access, CollectionBeforeDeleteHook, CollectionConfig } from 'payload';
import { can } from '@astralpirates/shared/authorization';

import {
  hasCrewRole,
  type CrewUser,
} from '../access/crew';
import {
  canEditFlightPlan,
  normaliseId,
} from '@/app/api/_lib/flightPlanMembers';
import { resolveGalleryFileReadAccess } from '@/app/api/_lib/mediaAccess';
import { MEDIA_COLLECTION_CONFIG } from '../storage/mediaConfig';
import {
  GALLERY_STORAGE_MIME_TYPES,
  resolveGalleryFilenameExtension,
} from '../storage/galleryMedia';
import {
  hasGalleryCleanupContextFlag,
  SKIP_GALLERY_OWNED_CLEANUP,
  SKIP_GALLERY_REFERENCE_PRUNE,
  withGalleryCleanupContextFlag,
} from '../lib/galleryCleanupContext';
import {
  pruneGalleryImageFromPageLayout,
  pruneGalleryImageFromSlides,
} from '../lib/galleryReferencePrune';

const galleryMediaConfig = MEDIA_COLLECTION_CONFIG.gallery;
const galleryStaticUrl = galleryMediaConfig.staticURL;
const galleryCdnPurgeUrl = process.env.GALLERY_CDN_PURGE_URL;

const randomSuffix = (size = 6): string => randomBytes(size).toString('hex');

const sanitizeStem = (value: string | null | undefined, fallback: string): string => {
  if (!value) return fallback;
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || fallback;
};

const resolveExtension = (filenameValue: string): string => {
  return resolveGalleryFilenameExtension(filenameValue, null);
};

const extractFlightPlanId = (value: unknown): number | null => normaliseId(value);
const extractPageId = (value: unknown): number | null => normaliseId(value);
const extractUploadedById = (value: unknown): number | null => {
  if (value && typeof value === 'object') {
    return normaliseId((value as { id?: unknown }).id);
  }
  return normaliseId(value);
};

const canEditPages = (user: CrewUser): boolean => {
  const userId = normaliseId(user.id);
  return can('editPage', {
    actor: {
      userId,
      isAuthenticated: userId != null,
      websiteRole: user.role ?? null,
    },
  });
};

const canManageMissionMedia = (user: CrewUser): boolean => {
  const userId = normaliseId(user.id);
  return can('manageMissionMedia', {
    actor: {
      userId,
      isAuthenticated: userId != null,
      websiteRole: user.role ?? null,
    },
  });
};

const buildPruneContext = (context: unknown): Record<string, unknown> => {
  const withCleanupSkip = withGalleryCleanupContextFlag(context, SKIP_GALLERY_OWNED_CLEANUP);
  return withGalleryCleanupContextFlag(withCleanupSkip, SKIP_GALLERY_REFERENCE_PRUNE);
};

const pruneGalleryReferencesFromFlightPlans = async ({
  galleryImageId,
  flightPlanId,
  req,
}: {
  galleryImageId: number;
  flightPlanId: number;
  req: Parameters<CollectionBeforeDeleteHook>[0]['req'];
}): Promise<void> => {
  const context = buildPruneContext(req.context);
  const plan = await req.payload.findByID({
    collection: 'flight-plans',
    id: flightPlanId,
    depth: 0,
    overrideAccess: true,
    req,
  });

  const pruned = pruneGalleryImageFromSlides({
    slides: (plan as { gallerySlides?: unknown }).gallerySlides,
    galleryImageId,
  });
  if (!pruned.changed) {
    return;
  }

  await req.payload.update({
    collection: 'flight-plans',
    id: flightPlanId,
    data: {
      visibility: (plan as { visibility?: unknown }).visibility,
      accessPolicy: (plan as { accessPolicy?: unknown }).accessPolicy ?? null,
      mediaVisibility: (plan as { mediaVisibility?: unknown }).mediaVisibility,
      crewCanPromotePassengers: Boolean(
        (plan as { crewCanPromotePassengers?: unknown }).crewCanPromotePassengers,
      ),
      passengersCanCreateTasks: Boolean(
        (plan as { passengersCanCreateTasks?: unknown }).passengersCanCreateTasks,
      ),
      passengersCanCommentOnTasks: Boolean(
        (plan as { passengersCanCommentOnTasks?: unknown }).passengersCanCommentOnTasks,
      ),
      isPublic: Boolean((plan as { isPublic?: unknown }).isPublic),
      publicContributions: Boolean(
        (plan as { publicContributions?: unknown }).publicContributions,
      ),
      gallerySlides: pruned.slides,
    } as any,
    overrideAccess: true,
    req,
    context,
  });
};

const pruneGalleryReferencesFromPages = async ({
  galleryImageId,
  pageId,
  req,
}: {
  galleryImageId: number;
  pageId: number;
  req: Parameters<CollectionBeforeDeleteHook>[0]['req'];
}): Promise<void> => {
  const context = buildPruneContext(req.context);
  const page = await req.payload.findByID({
    collection: 'pages',
    id: pageId,
    depth: 0,
    overrideAccess: true,
    req,
  });

  const pruned = pruneGalleryImageFromPageLayout({
    layout: (page as { layout?: unknown }).layout,
    galleryImageId,
  });
  if (!pruned.changed) {
    return;
  }

  await req.payload.update({
    collection: 'pages',
    id: pageId,
    data: {
      layout: pruned.layout,
    } as any,
    overrideAccess: true,
    req,
    context,
  });
};

export const pruneGalleryReferencesBeforeDelete: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  if (hasGalleryCleanupContextFlag(req.context, SKIP_GALLERY_REFERENCE_PRUNE)) {
    return;
  }

  const galleryImageId = normaliseId(id);
  if (galleryImageId == null) return;

  let imageDoc: { flightPlan?: unknown; page?: unknown } | null = null;
  try {
    imageDoc = (await req.payload.findByID({
      collection: 'gallery-images',
      id: galleryImageId,
      depth: 0,
      overrideAccess: true,
      req,
    })) as { flightPlan?: unknown; page?: unknown };
  } catch {
    imageDoc = null;
  }

  const flightPlanId = normaliseId(imageDoc?.flightPlan);
  const pageId = normaliseId(imageDoc?.page);
  let prunedByOwner = false;

  if (flightPlanId != null) {
    try {
      await pruneGalleryReferencesFromFlightPlans({
        galleryImageId,
        flightPlanId,
        req,
      });
      prunedByOwner = true;
    } catch (error) {
      req.payload.logger.warn(
        { err: error, galleryImageId, flightPlanId },
        '[gallery-images] failed owner-targeted mission prune',
      );
    }
  }

  if (pageId != null) {
    try {
      await pruneGalleryReferencesFromPages({
        galleryImageId,
        pageId,
        req,
      });
      prunedByOwner = true;
    } catch (error) {
      req.payload.logger.warn(
        { err: error, galleryImageId, pageId },
        '[gallery-images] failed owner-targeted page prune',
      );
    }
  }

  if (prunedByOwner) {
    return;
  }

  req.payload.logger.warn(
    { galleryImageId },
    '[gallery-images] owner relation unavailable; skipping fallback reference prune scan',
  );
};

export const sanitizeGalleryOwnership = ({
  flightPlan,
  page,
}: {
  flightPlan?: unknown;
  page?: unknown;
}): {
  flightPlanId: number | null;
  pageId: number | null;
} => {
  const flightPlanId = extractFlightPlanId(flightPlan);
  const pageId = extractPageId(page);
  if (flightPlanId != null && pageId != null) {
    throw new Error('Gallery asset must belong to either a mission or a page, not both.');
  }
  return { flightPlanId, pageId };
};

const formatGalleryFilename = ({
  originalFilename = 'gallery',
  data,
}: {
  originalFilename?: string;
  data?: Record<string, unknown>;
}) => {
  const ownerPrefix = (() => {
    const planId = extractFlightPlanId(data?.flightPlan);
    if (planId != null) return `plan-${planId}`;
    const pageId = extractPageId(data?.page);
    if (pageId != null) return `page-${pageId}`;
    return 'asset';
  })();
  const stem = sanitizeStem(path.basename(originalFilename, path.extname(originalFilename || 'gallery')), 'slide');
  const ext = resolveExtension(originalFilename || '');
  return `${ownerPrefix}-${stem}-${randomSuffix()}${ext}`;
};

const canManageGalleryImage: Access = async (args) => {
  const { req, data } = args;
  const doc =
    (args as { doc?: unknown }).doc ??
    (args as { originalDoc?: unknown }).originalDoc ??
    null;
  const existingDoc = doc as {
    flightPlan?: unknown;
    page?: unknown;
    uploadedBy?: unknown;
  } | null;
  const user = req.user as CrewUser | undefined;
  if (!hasCrewRole(user)) return false;
  if (canManageMissionMedia(user)) return true;

  const ownerId = extractUploadedById(data?.uploadedBy) ?? extractUploadedById(existingDoc?.uploadedBy);
  if (ownerId != null && ownerId === user.id) {
    return true;
  }

  const { flightPlanId: planId, pageId } = sanitizeGalleryOwnership({
    flightPlan: data?.flightPlan ?? existingDoc?.flightPlan,
    page: data?.page ?? existingDoc?.page,
  });

  if (planId != null) {
    try {
      return await canEditFlightPlan({
        payload: req.payload,
        flightPlanId: planId,
        userId: user?.id,
        websiteRole: user?.role,
      });
    } catch (error) {
      req.payload.logger.warn(
        { err: error, planId, userId: user?.id },
        '[gallery-images] failed to evaluate flight-plan access',
      );
      return false;
    }
  }

  if (pageId != null) {
    return canEditPages(user);
  }

  return false;
};

const resolveGalleryReadTarget = async (
  args: Parameters<Access>[0],
): Promise<Record<string, unknown> | null> => {
  const argsWithDoc = args as { doc?: unknown; id?: unknown };
  const existingDoc =
    argsWithDoc.doc && typeof argsWithDoc.doc === 'object'
      ? (argsWithDoc.doc as Record<string, unknown>)
      : null;
  if (existingDoc) return existingDoc;

  const id = normaliseId(argsWithDoc.id);
  if (id == null) return null;
  try {
    const loaded = await args.req.payload.findByID({
      collection: 'gallery-images',
      id,
      depth: 0,
      overrideAccess: true,
    });
    if (loaded && typeof loaded === 'object') {
      return loaded as unknown as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
};

const canReadGalleryImage: Access = async (args) => {
  const user = (args.req.user as CrewUser | undefined) ?? null;
  const targetDoc = await resolveGalleryReadTarget(args);
  if (!targetDoc) {
    // Prevent anonymous metadata scans for list queries.
    return Boolean(user);
  }

  const filename =
    typeof targetDoc.filename === 'string' ? targetDoc.filename.trim() : '';
  if (!filename) return false;

  const access = await resolveGalleryFileReadAccess({
    payload: args.req.payload as any,
    user,
    relativePath: filename,
  });
  return access.allow;
};

const canCreateGalleryImage: Access = async ({ req, data }) => {
  const user = req.user as CrewUser | undefined;
  if (!hasCrewRole(user)) return false;
  if (canManageMissionMedia(user)) return true;

  const { flightPlanId, pageId } = sanitizeGalleryOwnership({
    flightPlan: data?.flightPlan,
    page: data?.page,
  });

  if (flightPlanId != null) {
    try {
      return await canEditFlightPlan({
        payload: req.payload,
        flightPlanId,
        userId: user.id,
        websiteRole: user.role,
      });
    } catch (error) {
      req.payload.logger.warn(
        { err: error, flightPlanId, userId: user.id },
        '[gallery-images] failed to evaluate flight-plan access on create',
      );
      return false;
    }
  }

  if (pageId != null) {
    return canEditPages(user);
  }

  // Allow creating unattached uploads for later assignment by gallery blocks.
  return true;
};

const GalleryImages: CollectionConfig = {
  slug: 'gallery-images',
  access: {
    read: canReadGalleryImage,
    create: canCreateGalleryImage,
    update: canManageGalleryImage,
    delete: canManageGalleryImage,
  },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'filesize', 'width', 'height', 'flightPlan', 'page', 'updatedAt'],
    group: 'Media',
    description: 'Gallery uploads used by missions and static pages.',
  },
  upload: {
    staticDir: galleryMediaConfig.staticDir,
    staticURL: galleryStaticUrl,
    adminThumbnail: 'thumbnail',
    mimeTypes: Array.from(GALLERY_STORAGE_MIME_TYPES),
    imageSizes: [
      {
        name: 'thumbnail',
        width: 320,
        height: 180,
      },
      {
        name: 'preview',
        width: 1600,
        height: 900,
      },
    ],
    maxFileSize: galleryMediaConfig.maxFileSize,
    filename: formatGalleryFilename,
  } as any,
  fields: [
    {
      name: 'flightPlan',
      type: 'relationship',
      relationTo: 'flight-plans',
      required: false,
      admin: {
        position: 'sidebar',
        description: 'Mission that owns this upload (leave empty for static pages).',
      },
    },
    {
      name: 'page',
      type: 'relationship',
      relationTo: 'pages',
      required: false,
      admin: {
        position: 'sidebar',
        description: 'Static page that owns this upload (leave empty for missions).',
      },
    },
    {
      name: 'uploadedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data, req, operation, originalDoc }) => {
        const next = { ...(data ?? {}) };
        const original = (originalDoc as { uploadedBy?: unknown; flightPlan?: unknown; page?: unknown } | undefined) ?? {};
        const existingUploadedBy = extractUploadedById(
          original.uploadedBy,
        );
        if (operation === 'update' && existingUploadedBy != null) {
          next.uploadedBy = existingUploadedBy;
        } else if (req.user) {
          next.uploadedBy = req.user.id;
        }

        const hasIncomingFlightPlan = Object.prototype.hasOwnProperty.call(next, 'flightPlan');
        const hasIncomingPage = Object.prototype.hasOwnProperty.call(next, 'page');
        const { flightPlanId, pageId } = sanitizeGalleryOwnership({
          flightPlan: hasIncomingFlightPlan ? next.flightPlan : original.flightPlan,
          page: hasIncomingPage ? next.page : original.page,
        });
        next.flightPlan = flightPlanId;
        next.page = pageId;
        return next;
      },
    ],
    beforeDelete: [pruneGalleryReferencesBeforeDelete],
    afterChange: [
      async ({ doc, req }) => {
        if (!galleryCdnPurgeUrl) return;
        try {
          await fetch(galleryCdnPurgeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: doc.filename,
              staticUrl: `${galleryStaticUrl}/${doc.filename}`,
              action: 'update',
            }),
          });
          req.payload.logger.info?.(
            { filename: doc.filename, url: galleryCdnPurgeUrl },
            '[gallery-images] Issued CDN purge after upload/update',
          );
        } catch (error) {
          req.payload.logger.warn?.(
            { err: error, filename: doc.filename, url: galleryCdnPurgeUrl },
            '[gallery-images] Failed to purge CDN',
          );
        }
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        if (!galleryCdnPurgeUrl) return;
        try {
          await fetch(galleryCdnPurgeUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: (doc as any)?.filename,
              staticUrl: (doc as any)?.filename
                ? `${galleryStaticUrl}/${(doc as any).filename}`
                : null,
              action: 'delete',
            }),
          });
          req.payload.logger.info?.(
            { filename: (doc as any)?.filename, url: galleryCdnPurgeUrl },
            '[gallery-images] Issued CDN purge after delete',
          );
        } catch (error) {
          req.payload.logger.warn?.(
            { err: error, filename: (doc as any)?.filename, url: galleryCdnPurgeUrl },
            '[gallery-images] Failed to purge CDN on delete',
          );
        }
      },
    ],
  },
};

export default GalleryImages;
