import type { NextRequest } from 'next/server';
import { GALLERY_MEDIA_SOURCE_PREFIXES } from '@astralpirates/shared/mediaUrls';
import { deriveFlightPlanVisibility, resolveFlightPlanPolicy } from '@astralpirates/shared/accessPolicy';

import { authenticateRequest, buildRequestForUser } from '../../_lib/auth';
import { corsEmpty, corsJson } from '../../_lib/cors';
import {
  normalizeFlightPlanSlideInputs,
  normalizeFlightPlanSlides,
  normalizeRichTextContent,
  isLexicalDocument,
  resolveGalleryAssetUrl,
  richTextContentToLexicalDocument,
  resolveOwners,
  sanitizeFlightPlan,
} from '../../_lib/content';
import {
  listCrewPreviewMemberIds,
  normaliseId,
  canEditFlightPlan,
  evaluateFlightPlanReadAccessDecision,
  hasAdminEditOverrideForUser,
  loadMembershipWithOwnerFallback,
  type FlightPlanMembershipRecord,
} from '../../_lib/flightPlanMembers';
import { recordAuthorizationDecision } from '../../_lib/authorizationDecisionTelemetry';
import {
  beginEditorWriteIdempotency,
  buildEditorDocumentEtag,
  bumpEditorDocumentRevision,
  completeEditorWriteIdempotency,
  ensureEditorDocumentRevision,
  hashEditorLogToken,
  hashEditorMutationPayload,
  loadEditorDocumentLock,
  resolveEditorBaseRevision,
  sanitiseEditorIdempotencyKey,
  sanitiseEditorSessionId,
} from '../../_lib/editorWrites';
import {
  recordEditorIdempotencyReplay,
  recordEditorWriteAttempt,
  recordEditorWriteCommit,
  recordEditorWriteConflict,
} from '../../_lib/editorWriteMetrics';
import {
  buildFlightPlanReferencePathSet,
  rewriteLayoutFlightPlanReferences,
  shouldClearNavigationSourcePath,
} from '@/src/lib/flightPlanReferenceCleanup';
import { resolveFlightPlanMediaVisibility } from '../../_lib/mediaGovernance';
import {
  canHardDeleteFlightPlan,
  isTerminalFlightPlanStatus,
  resolveFlightPlanLifecycleStatus,
} from '../../_lib/flightPlanLifecycle';
import {
  queueMediaDelete,
  resolveMediaAssetClassForCollection,
} from '@/src/services/mediaLifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,GET,PATCH,DELETE';

const sanitizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeAccessPolicyInput = (value: unknown): Record<string, unknown> | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
};

const normalizeMediaVisibilityInput = (
  value: unknown,
): 'inherit' | 'crew_only' | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'inherit' || normalized === 'crew_only') {
    return normalized;
  }
  return null;
};

const parseDateInput = (value: unknown): Date | null => {
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
};

const toISODate = (date: Date): string => date.toISOString();

const formatDateCode = (date: Date): string => {
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

const formatDisplayDate = (date: Date): string =>
  new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(date);

const normalizeCategory = (value: unknown): 'test' | 'project' | 'event' | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed === 'test' || trimmed === 'project' || trimmed === 'event') {
    return trimmed;
  }
  return null;
};

const buildFallbackMissionBody = (doc: Record<string, unknown>): Record<string, unknown> => {
  const summary = sanitizeString(doc.summary);
  const title = sanitizeString(doc.title);
  const text = summary ?? title ?? 'Mission details pending.';
  return richTextContentToLexicalDocument([
    {
      type: 'paragraph',
      children: [{ text }],
    },
  ]);
};

type GallerySlideWrite = ReturnType<typeof normalizeFlightPlanSlideInputs>[number];
type GallerySlideWriteList = ReturnType<typeof normalizeFlightPlanSlideInputs>;

const decodeSlidePath = (value: string): string => {
  if (!value) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractGalleryFilenameFromSlideUrl = (value: string): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) return null;

  const pathname = (() => {
    if (!/^https?:\/\//i.test(trimmed)) {
      return trimmed;
    }
    try {
      return new URL(trimmed).pathname;
    } catch {
      return null;
    }
  })();

  if (!pathname) return null;

  for (const prefix of GALLERY_MEDIA_SOURCE_PREFIXES) {
    const index = pathname.indexOf(prefix);
    if (index === -1) continue;
    const relativePath = pathname.slice(index + prefix.length).replace(/^\/+/, '');
    if (!relativePath) continue;
    return decodeSlidePath(relativePath);
  }

  return null;
};

const hydrateGallerySlideIdsFromImageUrls = async ({
  payload,
  flightPlanId,
  slides,
}: {
  payload: { find: (...args: any[]) => Promise<any> };
  flightPlanId: number;
  slides: GallerySlideWriteList;
}): Promise<GallerySlideWriteList> => {
  const filenameByIndex = new Map<number, string>();
  const filenames = new Set<string>();

  slides.forEach((slide, index) => {
    if (slide.imageType !== 'upload' || slide.galleryImage || !slide.imageUrl) return;
    const filename = extractGalleryFilenameFromSlideUrl(slide.imageUrl);
    if (!filename) return;
    filenameByIndex.set(index, filename);
    filenames.add(filename);
  });

  if (!filenames.size) return slides;

  const assets = await payload.find({
    collection: 'gallery-images',
    where: {
      and: [
        {
          flightPlan: {
            equals: flightPlanId,
          },
        },
        {
          filename: {
            in: Array.from(filenames),
          },
        },
      ],
    },
    limit: filenames.size,
    depth: 0,
    overrideAccess: true,
  });

  const idByFilename = new Map<string, number>();
  for (const doc of assets?.docs ?? []) {
    const id = normaliseId((doc as { id?: unknown }).id);
    const filename = sanitizeString((doc as { filename?: unknown }).filename);
    if (id != null && filename) {
      idByFilename.set(filename, id);
    }
  }

  if (!idByFilename.size) return slides;

  return slides.map((slide, index) => {
    if (slide.imageType !== 'upload' || slide.galleryImage || !slide.imageUrl) {
      return slide;
    }
    const filename = filenameByIndex.get(index);
    if (!filename) return slide;
    const galleryImage = idByFilename.get(filename);
    if (galleryImage == null) return slide;
    return { ...slide, galleryImage } satisfies GallerySlideWrite;
  });
};

const hydrateGallerySlideUrls = async (
  payload: { find: (...args: any[]) => Promise<any> },
  slides: GallerySlideWriteList,
): Promise<GallerySlideWriteList> => {
  const missing = slides.filter(
    (slide) => slide.imageType === 'upload' && slide.galleryImage && !slide.imageUrl,
  );
  if (!missing.length) return slides;

  const ids = Array.from(
    new Set(
      missing
        .map((slide) => slide.galleryImage)
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
    ),
  );
  if (!ids.length) return slides;

  const assets = await payload.find({
    collection: 'gallery-images',
    where: { id: { in: ids } },
    limit: ids.length,
    depth: 0,
    overrideAccess: true,
  });

  const urlById = new Map<number, string>();
  for (const doc of assets?.docs ?? []) {
    const id = normaliseId((doc as { id?: unknown }).id);
    const url = resolveGalleryAssetUrl(doc);
    if (id != null && url) {
      urlById.set(id, url);
    }
  }

  return slides.map((slide) => {
    if (slide.imageType !== 'upload' || !slide.galleryImage || slide.imageUrl) {
      return slide;
    }
    const url = urlById.get(slide.galleryImage);
    if (!url) return slide;
    return { ...slide, imageUrl: url } satisfies GallerySlideWrite;
  });
};

const validateUploadSlideReferences = async (
  payload: { find: (...args: any[]) => Promise<any> },
  slides: GallerySlideWriteList,
): Promise<{ slides: GallerySlideWriteList; droppedMissingIds: number[] }> => {
  const uploadIds = Array.from(
    new Set(
      slides
        .filter((slide) => slide.imageType === 'upload')
        .map((slide) => slide.galleryImage)
        .filter((id): id is number => typeof id === 'number' && Number.isFinite(id)),
    ),
  );

  if (!uploadIds.length) {
    return { slides, droppedMissingIds: [] };
  }

  const assets = await payload.find({
    collection: 'gallery-images',
    where: { id: { in: uploadIds } },
    limit: uploadIds.length,
    depth: 0,
    overrideAccess: true,
  });

  const existingIds = new Set<number>();
  for (const doc of assets?.docs ?? []) {
    const id = normaliseId((doc as { id?: unknown }).id);
    if (id != null) {
      existingIds.add(id);
    }
  }

  const droppedMissingIds = new Set<number>();
  const normalizedSlides = slides
    .map((slide) => {
      if (slide.imageType !== 'upload' || !slide.galleryImage) {
        return slide;
      }

      if (existingIds.has(slide.galleryImage)) {
        return slide;
      }

      if (slide.imageUrl) {
        return {
          ...slide,
          imageType: 'url',
          galleryImage: null,
        } satisfies GallerySlideWrite;
      }

      droppedMissingIds.add(slide.galleryImage);
      return null;
    })
    .filter((slide): slide is GallerySlideWrite => slide != null);

  return {
    slides: normalizedSlides,
    droppedMissingIds: Array.from(droppedMissingIds),
  };
};

const deleteByFlightPlanId = async ({
  payload,
  collection,
  flightPlanId,
  req,
}: {
  payload: { find: (...args: any[]) => Promise<any>; delete: (...args: any[]) => Promise<any> };
  collection: string;
  flightPlanId: number;
  req?: unknown;
}): Promise<number> => {
  const result = await payload.find({
    collection,
    where: {
      flightPlan: {
        equals: flightPlanId,
      },
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });

  const docs = Array.isArray(result?.docs) ? result.docs : [];
  const mediaAssetClass = resolveMediaAssetClassForCollection(collection);
  const requestUserId = normaliseId((req as { user?: { id?: unknown } } | undefined)?.user?.id);
  for (const doc of docs) {
    const id = normaliseId((doc as { id?: unknown }).id);
    if (id == null) continue;
    if (mediaAssetClass) {
      await queueMediaDelete({
        payload: payload as any,
        assetClass: mediaAssetClass,
        assetId: id,
        mode: 'force',
        reason: 'flight-plan-delete-cascade',
        requestedByUserId: requestUserId,
      });
      continue;
    }
    await payload.delete({
      collection,
      id,
      req,
      overrideAccess: true,
    });
  }
  return docs.length;
};

const cleanStalePageAndNavigationReferences = async ({
  payload,
  req,
  slug,
  path,
}: {
  payload: {
    find: (...args: any[]) => Promise<any>;
    update: (...args: any[]) => Promise<any>;
    logger: {
      warn: (...args: any[]) => void;
      info: (...args: any[]) => void;
    };
  };
  req?: unknown;
  slug: string | null;
  path: string | null;
}): Promise<void> => {
  const targetPaths = buildFlightPlanReferencePathSet({ slug, path });
  if (!targetPaths.size) return;

  const pages = await payload.find({
    collection: 'pages',
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });

  let updatedPages = 0;
  let rewrittenReferences = 0;
  for (const page of pages?.docs ?? []) {
    const pageId = normaliseId((page as { id?: unknown }).id);
    if (pageId == null) continue;

    const rewriteResult = rewriteLayoutFlightPlanReferences({
      layout: (page as { layout?: unknown }).layout ?? [],
      targetPaths,
    });
    if (!rewriteResult.changed) continue;

    await payload.update({
      collection: 'pages',
      id: pageId,
      data: { layout: rewriteResult.layout },
      req,
      overrideAccess: true,
    });
    updatedPages += 1;
    rewrittenReferences += rewriteResult.rewrites;
  }

  const nodes = await payload.find({
    collection: 'navigation-nodes',
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });

  let clearedNavigationNodes = 0;
  for (const node of nodes?.docs ?? []) {
    const nodeId = normaliseId((node as { id?: unknown }).id);
    if (nodeId == null) continue;
    const sourcePath = (node as { sourcePath?: unknown }).sourcePath;
    if (!shouldClearNavigationSourcePath({ sourcePath, targetPaths })) continue;

    await payload.update({
      collection: 'navigation-nodes',
      id: nodeId,
      data: { sourcePath: null },
      req,
      overrideAccess: true,
    });
    clearedNavigationNodes += 1;
  }

  if (updatedPages > 0 || clearedNavigationNodes > 0) {
    payload.logger.info(
      {
        flightPlanSlug: slug,
        updatedPages,
        rewrittenReferences,
        clearedNavigationNodes,
      },
      'Cleaned stale flight-plan references from pages/navigation nodes',
    );
  }
};

const deleteFlightPlanDependents = async ({
  payload,
  flightPlanId,
  req,
}: {
  payload: { find: (...args: any[]) => Promise<any>; delete: (...args: any[]) => Promise<any> };
  flightPlanId: number;
  req?: unknown;
}) => {
  await deleteByFlightPlanId({ payload, collection: 'flight-plan-tasks', flightPlanId, req });
  await deleteByFlightPlanId({ payload, collection: 'flight-plan-membership-events', flightPlanId, req });
  await deleteByFlightPlanId({ payload, collection: 'flight-plan-memberships', flightPlanId, req });
  await deleteByFlightPlanId({ payload, collection: 'matrix-flight-plan-mutes', flightPlanId, req });
  await deleteByFlightPlanId({ payload, collection: 'gallery-images', flightPlanId, req });
};

const stampLogTombstones = async ({
  payload,
  flightPlanId,
  tombstone,
  req,
}: {
  payload: { find: (...args: any[]) => Promise<any>; update: (...args: any[]) => Promise<any> };
  flightPlanId: number;
  tombstone: Record<string, unknown>;
  req?: unknown;
}) => {
  const result = await payload.find({
    collection: 'logs',
    where: {
      flightPlan: {
        equals: flightPlanId,
      },
    },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const docs = Array.isArray(result?.docs) ? result.docs : [];
  for (const doc of docs) {
    const logId = normaliseId((doc as { id?: unknown }).id);
    if (logId == null) continue;
    await payload.update({
      collection: 'logs',
      id: logId,
      data: {
        flightPlan: null,
        flightPlanTombstone: tombstone,
      },
      req,
      overrideAccess: true,
    });
  }
};

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug?: string }> },
) {
  const resolvedParams = await context.params;
  const rawSlug = resolvedParams?.slug ?? '';
  const slug = rawSlug.trim();
  if (!slug) {
    return corsJson(
      req,
      { error: 'Flight plan not found.' },
      { status: 404 },
      METHODS,
    );
  }

  const auth = await authenticateRequest(req);
  const { payload, user } = auth;

  try {
    const findBySlug = async (overrideAccess: boolean) =>
      payload.find({
        collection: 'flight-plans',
        where: {
          slug: {
            equals: slug,
          },
        },
        limit: 1,
        depth: 1,
        overrideAccess,
      });

    const result = await findBySlug(false);
    let doc = result.docs[0] ?? null;
    let membershipResolved = false;
    let resolvedMembership: FlightPlanMembershipRecord | null = null;

    if (!doc) {
      const probe = await findBySlug(true);
      const probeDoc = probe.docs[0] ?? null;
      if (!probeDoc) {
        return corsJson(
          req,
          { error: 'Flight plan not found.' },
          { status: 404 },
          METHODS,
        );
      }

      const probePlanId = normaliseId((probeDoc as any)?.id);
      if (probePlanId == null) {
        return corsJson(
          req,
          { error: 'Unable to resolve flight plan identifier.' },
          { status: 500 },
          METHODS,
        );
      }

      const probeOwnerId = normaliseId((probeDoc as any)?.owner);
      if (user) {
        resolvedMembership = await loadMembershipWithOwnerFallback({
          payload,
          flightPlanId: probePlanId,
          userId: user.id,
          ownerIdHint: probeOwnerId ?? undefined,
        });
        membershipResolved = true;
      }

      const probeReadDecision = evaluateFlightPlanReadAccessDecision({
        user,
        ownerId: probeOwnerId,
        membership: resolvedMembership,
        policy: (probeDoc as any)?.accessPolicy,
        visibility: (probeDoc as any)?.visibility,
        isPublic: (probeDoc as any)?.isPublic,
        publicContributions: (probeDoc as any)?.publicContributions,
        adminMode: auth.adminMode,
      });

      recordAuthorizationDecision({
        payload,
        capability: 'readFlightPlan',
        allowed: probeReadDecision.allowed,
        reasonCode: probeReadDecision.allowed
          ? probeReadDecision.adminOverrideApplied
            ? 'allow_admin_read_override'
            : 'allow_policy_or_membership'
          : user
            ? 'deny_policy_restricted'
            : 'deny_auth_required',
        actorId: user?.id ?? null,
        actorRole: user?.role ?? null,
        resourceType: 'flight-plan',
        resourceId: probePlanId,
        resourceSlug: slug,
        metadata: {
          phase: 'probe',
          adminOverrideApplied: probeReadDecision.adminOverrideApplied,
        },
      });

      if (!probeReadDecision.allowed) {
        return corsJson(
          req,
          {
            error: user
              ? 'You do not have permission to view this mission.'
              : 'Sign in to view this mission.',
          },
          { status: user ? 403 : 401 },
          METHODS,
        );
      }

      doc = probeDoc;
    }

    const planId = normaliseId((doc as any)?.id);
    if (planId == null) {
      return corsJson(
        req,
        { error: 'Unable to resolve flight plan identifier.' },
        { status: 500 },
        METHODS,
      );
    }

    const ownerId = normaliseId((doc as any)?.owner);
    let membership = resolvedMembership;

    if (user && !membershipResolved) {
      membership = await loadMembershipWithOwnerFallback({
        payload,
        flightPlanId: planId,
        userId: user.id,
        ownerIdHint: ownerId ?? undefined,
      });
      membershipResolved = true;
    }

    const readDecision = evaluateFlightPlanReadAccessDecision({
      user,
      ownerId,
      membership,
      policy: (doc as any)?.accessPolicy,
      visibility: (doc as any)?.visibility,
      isPublic: (doc as any)?.isPublic,
      publicContributions: (doc as any)?.publicContributions,
      adminMode: auth.adminMode,
    });

    recordAuthorizationDecision({
      payload,
      capability: 'readFlightPlan',
      allowed: readDecision.allowed,
      reasonCode: readDecision.allowed
        ? readDecision.adminOverrideApplied
          ? 'allow_admin_read_override'
          : 'allow_policy_or_membership'
        : user
          ? 'deny_policy_restricted'
          : 'deny_auth_required',
      actorId: user?.id ?? null,
      actorRole: user?.role ?? null,
      resourceType: 'flight-plan',
      resourceId: planId,
      resourceSlug: slug,
      metadata: {
        phase: 'final',
        adminOverrideApplied: readDecision.adminOverrideApplied,
      },
    });

    if (!readDecision.allowed) {
      return corsJson(
        req,
        {
          error: user
            ? 'You do not have permission to view this mission.'
            : 'Sign in to view this mission.',
        },
        { status: user ? 403 : 401 },
        METHODS,
      );
    }

    let ownerMap = await resolveOwners(payload, [doc]);
    let crewPreviewMap: Map<number, number[]> | null = null;

    const previewMembers = await listCrewPreviewMemberIds({
      payload,
      flightPlanIds: [planId],
      limit: 5,
    });
    if (previewMembers.size) {
      const previewOwnerDocs = Array.from(
        new Set(previewMembers.get(planId) ?? []),
      ).map((userId) => ({ owner: userId }));
      ownerMap = await resolveOwners(payload, previewOwnerDocs, ownerMap);
      crewPreviewMap = previewMembers;
    }

    const sanitized = sanitizeFlightPlan(doc, ownerMap, crewPreviewMap ?? undefined);
    const revisionState = await ensureEditorDocumentRevision({
      payload: auth.payload,
      documentType: 'flight-plan',
      documentId: planId,
    });
    const etag = buildEditorDocumentEtag({
      documentType: 'flight-plan',
      documentId: planId,
      revision: revisionState.revision,
    });
    const response = corsJson(
      req,
      {
        plan: sanitized,
        revision: revisionState.revision,
        etag,
      },
      {},
      METHODS,
    );
    response.headers.set('ETag', etag);
    response.headers.append('Vary', 'If-Match');
    return response;
  } catch (error) {
    payload.logger.error({ err: error, slug }, 'Failed to load flight plan by slug');
    return corsJson(
      req,
      { error: 'Unable to load flight plan.' },
      { status: 500 },
      METHODS,
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ slug?: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const resolvedParams = await context.params;
  const rawSlug = resolvedParams?.slug ?? '';
  const slug = rawSlug.trim();
  if (!slug) {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  let idempotencyContext:
    | {
        documentId: number;
        key: string;
        active: boolean;
      }
    | null = null;

  try {
    const result = await auth.payload.find({
      collection: 'flight-plans',
      where: {
        slug: {
          equals: slug,
        },
      },
      limit: 1,
      depth: 0,
      overrideAccess: false,
    });

    const doc = result.docs[0];
    if (!doc) {
      return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
    }

    const flightPlanId = normaliseId((doc as any)?.id);
    if (flightPlanId == null) {
      return corsJson(
        req,
        { error: 'Unable to resolve flight plan identifier.' },
        { status: 500 },
        METHODS,
      );
    }

    const ownerId = normaliseId((doc as any)?.owner);
    const authUserId = normaliseId(auth.user.id);
    const hasAdminEditOverride = hasAdminEditOverrideForUser({
      userId: auth.user.id,
      websiteRole: auth.user.role,
      adminMode: auth.adminMode,
    });
    const mayEdit = await canEditFlightPlan({
      payload: auth.payload,
      flightPlanId,
      userId: auth.user.id,
      ownerIdHint: ownerId ?? undefined,
      websiteRole: auth.user.role,
      adminMode: auth.adminMode,
      publicContributions: Boolean((doc as any)?.publicContributions),
      enforceContributorPolicy: true,
    });
    if (!mayEdit) {
      recordAuthorizationDecision({
        payload: auth.payload,
        capability: 'editFlightPlan',
        allowed: false,
        reasonCode: 'deny_edit_membership_or_admin_required',
        actorId: auth.user.id,
        actorRole: auth.user.role,
        resourceType: 'flight-plan',
        resourceId: flightPlanId,
        resourceSlug: slug,
        metadata: {
          adminViewEnabled: auth.adminMode?.adminViewEnabled ?? false,
          adminEditEnabled: auth.adminMode?.adminEditEnabled ?? false,
        },
      });
      return corsJson(
        req,
        { error: 'Only the captain or confirmed crew can update this mission.' },
        { status: 403 },
        METHODS,
      );
    }

    const lifecycleStatus = resolveFlightPlanLifecycleStatus((doc as any)?.status);
    if (
      isTerminalFlightPlanStatus(lifecycleStatus) &&
      ownerId !== authUserId &&
      !hasAdminEditOverride
    ) {
      recordAuthorizationDecision({
        payload: auth.payload,
        capability: 'editFlightPlan',
        allowed: false,
        reasonCode: 'deny_terminal_owner_required',
        actorId: auth.user.id,
        actorRole: auth.user.role,
        resourceType: 'flight-plan',
        resourceId: flightPlanId,
        resourceSlug: slug,
      });
      return corsJson(
        req,
        { error: 'Terminal missions are editable by the captain only.' },
        { status: 403 },
        METHODS,
      );
    }

    recordAuthorizationDecision({
      payload: auth.payload,
      capability: 'editFlightPlan',
      allowed: true,
      reasonCode:
        auth.adminMode?.adminEditEnabled === true
          ? 'allow_admin_edit_or_membership'
          : 'allow_membership_or_owner',
      actorId: auth.user.id,
      actorRole: auth.user.role,
      resourceType: 'flight-plan',
      resourceId: flightPlanId,
      resourceSlug: slug,
      metadata: {
        adminViewEnabled: auth.adminMode?.adminViewEnabled ?? false,
        adminEditEnabled: auth.adminMode?.adminEditEnabled ?? false,
      },
    });

    let payloadBody: any = null;
    try {
      payloadBody = await req.json();
    } catch (error) {
      return corsJson(req, { error: 'Invalid JSON payload.' }, { status: 400 }, METHODS);
    }

    const idempotencyKey = sanitiseEditorIdempotencyKey(
      req.headers.get('x-idempotency-key') ?? payloadBody?.idempotencyKey,
    );
    if (!idempotencyKey) {
      return corsJson(
        req,
        { error: 'x-idempotency-key header (or idempotencyKey field) is required.' },
        { status: 400 },
        METHODS,
      );
    }
    const idempotencyKeyHash = hashEditorLogToken(idempotencyKey);
    recordEditorWriteAttempt(auth.payload.logger ?? console, 'flight-plan');

    const revisionState = await ensureEditorDocumentRevision({
      payload: auth.payload,
      documentType: 'flight-plan',
      documentId: flightPlanId,
    });
    const revisionEtag = buildEditorDocumentEtag({
      documentType: 'flight-plan',
      documentId: flightPlanId,
      revision: revisionState.revision,
    });
    const baseRevision = resolveEditorBaseRevision({
      baseRevision: payloadBody?.baseRevision,
      ifMatch: req.headers.get('if-match'),
      documentType: 'flight-plan',
      documentId: flightPlanId,
    });

    if (!baseRevision) {
      auth.payload.logger?.warn?.(
        {
          event: 'editor_write_base_revision_required',
          documentType: 'flight-plan',
          documentId: flightPlanId,
          slug,
          actorId: authUserId,
          idempotencyKeyHash,
          serverRevision: revisionState.revision,
        },
        '[editor-write] base revision missing',
      );
      const response = corsJson(
        req,
        {
          error: 'baseRevision (or If-Match) is required for editor writes.',
          code: 'base_revision_required',
          serverRevision: revisionState.revision,
          etag: revisionEtag,
        },
        { status: 400 },
        METHODS,
      );
      response.headers.set('ETag', revisionEtag);
      response.headers.append('Vary', 'If-Match');
      return response;
    }

    if (baseRevision !== revisionState.revision) {
      recordEditorWriteConflict(auth.payload.logger ?? console, 'flight-plan', 'stale_revision');
      auth.payload.logger?.warn?.(
        {
          event: 'editor_write_conflict',
          documentType: 'flight-plan',
          documentId: flightPlanId,
          slug,
          actorId: authUserId,
          idempotencyKeyHash,
          baseRevision,
          serverRevision: revisionState.revision,
          reason: 'stale_revision',
        },
        '[editor-write] revision conflict',
      );
      const conflictPayload = {
        error: 'Revision conflict. Reload latest mission data and retry.',
        code: 'revision_conflict',
        serverRevision: revisionState.revision,
        etag: revisionEtag,
      };
      const response = corsJson(req, conflictPayload, { status: 409 }, METHODS);
      response.headers.set('ETag', revisionEtag);
      response.headers.append('Vary', 'If-Match');
      return response;
    }

    const editorSessionId =
      sanitiseEditorSessionId(payloadBody?.sessionId) ??
      sanitiseEditorSessionId(req.headers.get('x-editor-session-id'));
    const activeLock = await loadEditorDocumentLock({
      payload: auth.payload,
      documentType: 'flight-plan',
      documentId: flightPlanId,
    });
    if (activeLock) {
      const expiresMs = Date.parse(activeLock.expiresAt);
      const lockIsActive = Number.isFinite(expiresMs) ? expiresMs > Date.now() : true;
      const sameHolder =
        authUserId != null &&
        activeLock.holderUserId === authUserId &&
        (!editorSessionId || activeLock.holderSessionId === editorSessionId);
      if (lockIsActive && !sameHolder) {
        recordEditorWriteConflict(auth.payload.logger ?? console, 'flight-plan', 'locked');
        auth.payload.logger?.warn?.(
          {
            event: 'editor_write_locked',
            documentType: 'flight-plan',
            documentId: flightPlanId,
            slug,
            actorId: authUserId,
            idempotencyKeyHash,
            baseRevision,
            serverRevision: revisionState.revision,
            holderUserId: activeLock.holderUserId,
            holderSessionId: activeLock.holderSessionId,
            expiresAt: activeLock.expiresAt,
            lockMode: activeLock.lockMode,
          },
          '[editor-write] blocked by active lock',
        );
        return corsJson(
          req,
          {
            error: 'Document is currently locked by another editor session.',
            code: 'editor_locked',
            lock: activeLock,
          },
          { status: 423 },
          METHODS,
        );
      }
    }

    const title = sanitizeString(payloadBody?.title);
    const summary = sanitizeString(payloadBody?.summary);
    const rawBody = payloadBody?.body;
    const body = normalizeRichTextContent(rawBody);
    const lexicalBody = isLexicalDocument(rawBody)
      ? rawBody
      : richTextContentToLexicalDocument(body);
    const existingRawBody = (doc as { body?: unknown }).body;
    const existingBody = normalizeRichTextContent(existingRawBody);
    const existingLexicalBody = isLexicalDocument(existingRawBody)
      ? existingRawBody
      : richTextContentToLexicalDocument(existingBody);
    const location = sanitizeString(payloadBody?.location);
    const displayDateInput = sanitizeString(payloadBody?.displayDate);
    const eventDateValue = parseDateInput(payloadBody?.eventDate);
    const hasTitle = Object.prototype.hasOwnProperty.call(payloadBody ?? {}, 'title');
    const hasBody = Object.prototype.hasOwnProperty.call(payloadBody ?? {}, 'body');
    const hasSummary = Object.prototype.hasOwnProperty.call(payloadBody ?? {}, 'summary');
    const hasLocation = Object.prototype.hasOwnProperty.call(payloadBody ?? {}, 'location');
    const eventDateProvided = Object.prototype.hasOwnProperty.call(payloadBody ?? {}, 'eventDate');
    const displayDateProvided = Object.prototype.hasOwnProperty.call(payloadBody ?? {}, 'displayDate');
    const crewPromotionProvided = Object.prototype.hasOwnProperty.call(
      payloadBody ?? {},
      'crewCanPromotePassengers',
    );
    const passengerTasksProvided = Object.prototype.hasOwnProperty.call(
      payloadBody ?? {},
      'passengersCanCreateTasks',
    );
    const visibilityProvided = Object.prototype.hasOwnProperty.call(payloadBody ?? {}, 'isPublic');
    const visibilityLevelProvided = Object.prototype.hasOwnProperty.call(payloadBody ?? {}, 'visibility');
    const accessPolicyProvided = Object.prototype.hasOwnProperty.call(payloadBody ?? {}, 'accessPolicy');
    const mediaVisibilityProvided = Object.prototype.hasOwnProperty.call(
      payloadBody ?? {},
      'mediaVisibility',
    );
    const categoryProvided = Object.prototype.hasOwnProperty.call(payloadBody ?? {}, 'category');
    const contributionsProvided = Object.prototype.hasOwnProperty.call(
      payloadBody ?? {},
      'publicContributions',
    );
    const gallerySlidesProvided = Object.prototype.hasOwnProperty.call(
      payloadBody ?? {},
      'gallerySlides',
    );

    if ((hasTitle || hasBody) && (!hasTitle || !title || !hasBody || body.length === 0)) {
      return corsJson(req, { error: 'Title and body are required.' }, { status: 400 }, METHODS);
    }

    const ownerOnlySettingsGuard =
      crewPromotionProvided ||
      passengerTasksProvided ||
      visibilityProvided ||
      visibilityLevelProvided ||
      accessPolicyProvided ||
      mediaVisibilityProvided ||
      contributionsProvided;

    if (ownerOnlySettingsGuard && ownerId == null) {
      return corsJson(
        req,
        { error: 'Unable to resolve captain for this mission.' },
        { status: 500 },
        METHODS,
      );
    }

    if (ownerOnlySettingsGuard && authUserId == null) {
      return corsJson(
        req,
        { error: 'Unable to resolve authenticated user identifier.' },
        { status: 500 },
        METHODS,
      );
    }

    if (ownerOnlySettingsGuard && ownerId !== authUserId && !hasAdminEditOverride) {
      return corsJson(
        req,
        {
          error:
            'Only the captain can change mission collaboration or visibility settings unless captain admin edit mode is enabled.',
        },
        { status: 403 },
        METHODS,
      );
    }

    let eventDateISO: string | null | undefined;
    let dateCode: string | null | undefined;
    let derivedDisplayDate: string | null | undefined;
    if (eventDateProvided) {
      if (eventDateValue) {
        eventDateISO = toISODate(eventDateValue);
        dateCode = formatDateCode(eventDateValue);
        derivedDisplayDate = formatDisplayDate(eventDateValue);
      } else {
        eventDateISO = null;
        dateCode = null;
        derivedDisplayDate = null;
      }
    }

    let sanitizedSlides = gallerySlidesProvided
      ? normalizeFlightPlanSlideInputs(payloadBody?.gallerySlides)
      : null;
    if (gallerySlidesProvided && sanitizedSlides?.length) {
      sanitizedSlides = await hydrateGallerySlideIdsFromImageUrls({
        payload: auth.payload,
        flightPlanId,
        slides: sanitizedSlides,
      });
      sanitizedSlides = await hydrateGallerySlideUrls(auth.payload, sanitizedSlides);
      const validatedSlides = await validateUploadSlideReferences(auth.payload, sanitizedSlides);
      if (validatedSlides.droppedMissingIds.length > 0) {
        auth.payload.logger.warn(
          {
            slug,
            flightPlanId,
            droppedMissingGalleryImageIds: validatedSlides.droppedMissingIds,
          },
          'Dropped missing gallery upload references while updating flight plan',
        );
      }
      sanitizedSlides = validatedSlides.slides;
    }

    const data: Record<string, unknown> = {};

    if (hasTitle || hasBody) {
      data.title = title;
      data.body = lexicalBody;
    }

    if (hasSummary) {
      data.summary = summary ?? null;
    }

    if (hasLocation) {
      data.location = location ?? null;
    }

    if (eventDateProvided) {
      data.eventDate = eventDateISO ?? null;
      data.dateCode = dateCode ?? null;
    }

    if (displayDateProvided) {
      data.displayDate = displayDateInput;
    } else if (eventDateProvided) {
      data.displayDate = derivedDisplayDate ?? null;
    }

    if (crewPromotionProvided) {
      data.crewCanPromotePassengers = Boolean(payloadBody?.crewCanPromotePassengers);
    }
    if (passengerTasksProvided) {
      data.passengersCanCreateTasks = Boolean(payloadBody?.passengersCanCreateTasks);
    }
    const nextIsPublic = visibilityProvided
      ? Boolean(payloadBody?.isPublic)
      : Boolean((doc as { isPublic?: unknown }).isPublic);
    const nextPublicContributions = contributionsProvided
      ? Boolean(payloadBody?.publicContributions)
      : Boolean((doc as { publicContributions?: unknown }).publicContributions);
    if (visibilityProvided || visibilityLevelProvided || accessPolicyProvided || contributionsProvided) {
      const explicitAccessPolicy = accessPolicyProvided
        ? normalizeAccessPolicyInput(payloadBody?.accessPolicy)
        : undefined;
      const resolvedReadPolicy = resolveFlightPlanPolicy({
        policy: explicitAccessPolicy as any,
        visibility: visibilityLevelProvided ? sanitizeString(payloadBody?.visibility) : undefined,
        isPublic: nextIsPublic,
        publicContributions: nextPublicContributions,
      });
      const resolvedVisibility = deriveFlightPlanVisibility(resolvedReadPolicy);
      data.accessPolicy = resolvedReadPolicy;
      data.visibility = resolvedVisibility;
      data.isPublic = resolvedVisibility === 'public';
      data.publicContributions = nextPublicContributions;
    }
    if (mediaVisibilityProvided) {
      const mediaVisibility = normalizeMediaVisibilityInput(payloadBody?.mediaVisibility);
      if (!mediaVisibility) {
        return corsJson(
          req,
          { error: 'mediaVisibility must be one of: inherit, crew_only.' },
          { status: 400 },
          METHODS,
        );
      }
      data.mediaVisibility = resolveFlightPlanMediaVisibility(mediaVisibility);
    }
    if (categoryProvided) {
      const categoryValue = normalizeCategory(payloadBody?.category);
      if (!categoryValue) {
        return corsJson(
          req,
          { error: 'Category must be one of: test, project, event.' },
          { status: 400 },
          METHODS,
        );
      }
      data.category = categoryValue;
    }
    if (gallerySlidesProvided) {
      data.gallerySlides = sanitizedSlides ?? [];
    }

    const hasUpdates = Object.keys(data).length > 0;
    if (hasUpdates && !Object.prototype.hasOwnProperty.call(data, 'body')) {
      data.body = existingBody.length
        ? existingLexicalBody
        : buildFallbackMissionBody(doc as unknown as Record<string, unknown>);
    }

    if (!hasUpdates) {
      return corsJson(
        req,
        { error: 'No valid updates were provided for this mission.' },
        { status: 400 },
        METHODS,
      );
    }

    const mutationPayload = {
      ...payloadBody,
      documentType: 'flight-plan',
      documentId: flightPlanId,
    };
    const requestHash = hashEditorMutationPayload(mutationPayload);
    const idempotencyStart = await beginEditorWriteIdempotency({
      payload: auth.payload,
      documentType: 'flight-plan',
      documentId: flightPlanId,
      idempotencyKey,
      requestHash,
    });

    if (idempotencyStart.status === 'replay') {
      recordEditorIdempotencyReplay(auth.payload.logger ?? console, 'flight-plan');
      auth.payload.logger?.info?.(
        {
          event: 'editor_write_idempotency_replay',
          documentType: 'flight-plan',
          documentId: flightPlanId,
          slug,
          actorId: authUserId,
          idempotencyKeyHash,
          baseRevision,
          replayStatus: idempotencyStart.responseStatus,
          resultingRevision: idempotencyStart.resultingRevision,
        },
        '[editor-write] idempotency replay',
      );
      const replayBody =
        idempotencyStart.responseBody && typeof idempotencyStart.responseBody === 'object'
          ? idempotencyStart.responseBody
          : { ok: true };
      const response = corsJson(
        req,
        replayBody,
        { status: idempotencyStart.responseStatus },
        METHODS,
      );
      if (idempotencyStart.resultingRevision != null) {
        const replayEtag = buildEditorDocumentEtag({
          documentType: 'flight-plan',
          documentId: flightPlanId,
          revision: idempotencyStart.resultingRevision,
        });
        response.headers.set('ETag', replayEtag);
        response.headers.append('Vary', 'If-Match');
      }
      return response;
    }

    if (idempotencyStart.status === 'conflict') {
      recordEditorWriteConflict(
        auth.payload.logger ?? console,
        'flight-plan',
        'idempotency_conflict',
      );
      auth.payload.logger?.warn?.(
        {
          event: 'editor_write_idempotency_conflict',
          documentType: 'flight-plan',
          documentId: flightPlanId,
          slug,
          actorId: authUserId,
          idempotencyKeyHash,
          baseRevision,
        },
        '[editor-write] idempotency key conflict',
      );
      return corsJson(
        req,
        {
          error: idempotencyStart.message,
          code: 'idempotency_conflict',
        },
        { status: 409 },
        METHODS,
      );
    }

    if (idempotencyStart.status === 'in_progress') {
      auth.payload.logger?.warn?.(
        {
          event: 'editor_write_idempotency_in_progress',
          documentType: 'flight-plan',
          documentId: flightPlanId,
          slug,
          actorId: authUserId,
          idempotencyKeyHash,
          baseRevision,
        },
        '[editor-write] idempotency key already in progress',
      );
      return corsJson(
        req,
        {
          error: 'A matching write is already in progress. Retry shortly.',
          code: 'idempotency_in_progress',
        },
        { status: 409 },
        METHODS,
      );
    }

    idempotencyContext = {
      documentId: flightPlanId,
      key: idempotencyKey,
      active: true,
    };

    const reqForUser = await buildRequestForUser(auth.payload, auth.user);
    const updated = await auth.payload.update({
      collection: 'flight-plans',
      id: flightPlanId,
      data,
      req: reqForUser,
      depth: 1,
    });

    const ownerMap = await resolveOwners(auth.payload, [updated]);
    const sanitized = sanitizeFlightPlan(updated, ownerMap);

    const bumpedRevision = await bumpEditorDocumentRevision({
      payload: auth.payload,
      documentType: 'flight-plan',
      documentId: flightPlanId,
      expectedRevision: baseRevision,
    });

    if (!bumpedRevision) {
      recordEditorWriteConflict(
        auth.payload.logger ?? console,
        'flight-plan',
        'post_update_bump_failed',
      );
      auth.payload.logger?.warn?.(
        {
          event: 'editor_write_conflict',
          documentType: 'flight-plan',
          documentId: flightPlanId,
          slug,
          actorId: authUserId,
          idempotencyKeyHash,
          baseRevision,
          reason: 'post_update_bump_failed',
        },
        '[editor-write] revision bump conflict',
      );
      const conflictPayload = {
        error: 'Revision conflict. Reload latest mission data and retry.',
        code: 'revision_conflict',
      };
      await completeEditorWriteIdempotency({
        payload: auth.payload,
        documentType: 'flight-plan',
        documentId: flightPlanId,
        idempotencyKey,
        responseStatus: 409,
        responseBody: conflictPayload,
        resultingRevision: null,
      });
      idempotencyContext.active = false;
      return corsJson(req, conflictPayload, { status: 409 }, METHODS);
    }

    const responsePayload = {
      plan: sanitized,
      revision: bumpedRevision.revision,
      etag: buildEditorDocumentEtag({
        documentType: 'flight-plan',
        documentId: flightPlanId,
        revision: bumpedRevision.revision,
      }),
    };

    await completeEditorWriteIdempotency({
      payload: auth.payload,
      documentType: 'flight-plan',
      documentId: flightPlanId,
      idempotencyKey,
      responseStatus: 200,
      responseBody: responsePayload,
      resultingRevision: bumpedRevision.revision,
    });
    idempotencyContext.active = false;
    recordEditorWriteCommit(auth.payload.logger ?? console, 'flight-plan');

    auth.payload.logger?.info?.(
      {
        event: 'editor_write_commit',
        documentType: 'flight-plan',
        documentId: flightPlanId,
        slug,
        actorId: authUserId,
        idempotencyKeyHash,
        baseRevision,
        resultingRevision: bumpedRevision.revision,
        operationCount: Object.keys(data).length,
      },
      '[editor-write] commit success',
    );

    const response = corsJson(req, responsePayload, {}, METHODS);
    response.headers.set('ETag', responsePayload.etag);
    response.headers.append('Vary', 'If-Match');
    return response;
  } catch (error) {
    if (idempotencyContext?.active) {
      try {
        const failurePayload = {
          error: error instanceof Error ? error.message : 'Unable to update flight plan.',
          code: 'update_failed',
        };
        await completeEditorWriteIdempotency({
          payload: auth.payload,
          documentType: 'flight-plan',
          documentId: idempotencyContext.documentId,
          idempotencyKey: idempotencyContext.key,
          responseStatus: 400,
          responseBody: failurePayload,
          resultingRevision: null,
        });
      } catch {
        // Ignore idempotency persistence failures so the API error can still surface.
      }
    }
    auth.payload.logger.error({ err: error, slug }, 'Failed to update flight plan');
    return corsJson(
      req,
      { error: error instanceof Error ? error.message : 'Unable to update flight plan.' },
      { status: 400 },
      METHODS,
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ slug?: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const resolvedParams = await context.params;
  const rawSlug = resolvedParams?.slug ?? '';
  const slug = rawSlug.trim();
  if (!slug) {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  try {
    const result = await auth.payload.find({
      collection: 'flight-plans',
      where: {
        slug: {
          equals: slug,
        },
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });

    const doc = result.docs[0];
    if (!doc) {
      return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
    }

    const flightPlanId = normaliseId((doc as any)?.id);
    if (flightPlanId == null) {
      return corsJson(
        req,
        { error: 'Unable to resolve flight plan identifier.' },
        { status: 500 },
        METHODS,
      );
    }

    const ownerId = normaliseId((doc as any)?.owner);
    const authUserId = normaliseId(auth.user.id);
    if (authUserId == null) {
      return corsJson(
        req,
        { error: 'Unable to resolve authenticated user identifier.' },
        { status: 500 },
        METHODS,
      );
    }

    const deleteAllowed = canHardDeleteFlightPlan({
      ownerId,
      user: auth.user,
      adminMode: auth.adminMode,
    });
    recordAuthorizationDecision({
      payload: auth.payload,
      capability: 'deleteFlightPlan',
      allowed: deleteAllowed,
      reasonCode: deleteAllowed
        ? 'allow_owner_or_quartermaster'
        : 'deny_owner_or_quartermaster_required',
      actorId: auth.user.id,
      actorRole: auth.user.role,
      resourceType: 'flight-plan',
      resourceId: flightPlanId,
      resourceSlug: slug,
    });

    if (!deleteAllowed) {
      return corsJson(
        req,
        { error: 'Only the captain or quartermaster+ can delete this mission.' },
        { status: 403 },
        METHODS,
      );
    }

    const reqForUser = await buildRequestForUser(auth.payload, auth.user);
    const planSlug =
      typeof (doc as any)?.slug === 'string' ? ((doc as any).slug as string).trim() : null;
    const planPath =
      typeof (doc as any)?.path === 'string' ? ((doc as any).path as string).trim() : null;
    const tombstone = {
      id: flightPlanId,
      slug: planSlug,
      title: typeof (doc as any)?.title === 'string' ? (doc as any).title : null,
      location: typeof (doc as any)?.location === 'string' ? (doc as any).location : null,
      displayDate: typeof (doc as any)?.displayDate === 'string' ? (doc as any).displayDate : null,
      deletedAt: new Date().toISOString(),
    };

    await stampLogTombstones({
      payload: auth.payload,
      flightPlanId,
      tombstone,
      req: reqForUser,
    });

    await deleteFlightPlanDependents({
      payload: auth.payload,
      flightPlanId,
      req: reqForUser,
    });

    await auth.payload.delete({
      collection: 'flight-plans',
      id: flightPlanId,
      req: reqForUser,
      overrideAccess: true,
    });

    try {
      await cleanStalePageAndNavigationReferences({
        payload: auth.payload,
        req: reqForUser,
        slug: planSlug,
        path: planPath,
      });
    } catch (cleanupError) {
      auth.payload.logger.warn(
        { err: cleanupError, slug: planSlug, flightPlanId },
        'Failed to clean stale flight-plan references from pages/navigation nodes',
      );
    }

    return corsEmpty(req, METHODS);
  } catch (error) {
    auth.payload.logger.error({ err: error, slug, userId: auth.user.id }, 'Failed to delete flight plan');
    return corsJson(req, { error: 'Unable to delete the mission.' }, { status: 500 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
