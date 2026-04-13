import { canUserReadCrewPolicy, canUserReadFlightPlan } from './accessPolicy';
import { recordAuthorizationDecision } from './authorizationDecisionTelemetry';
import { resolvePageEditAccess } from './pageEditorAccess';
import {
  canEditFlightPlan,
  ensureCrewMembership,
  hasAdminEditOverrideForUser,
  loadMembershipWithOwnerFallback,
} from './flightPlanMembers';
import {
  type EffectiveAdminMode,
} from '@astralpirates/shared/adminMode';
import { can } from '@astralpirates/shared/authorization';
import {
  isMediaGovernanceEnforced,
  recordMediaGovernanceAudit,
  resolveFlightPlanMediaVisibility,
  resolveMediaGovernanceMode,
} from './mediaGovernance';

type UserLike =
  | {
      id?: unknown;
      role?: unknown;
    }
  | null
  | undefined;

type PayloadLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs?: unknown[] }>;
  findByID: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  logger?: {
    info?: (meta: Record<string, unknown>, message: string) => void;
    warn?: (meta: Record<string, unknown>, message: string) => void;
  };
};

type MediaAccessAllowed = {
  allow: true;
  page?: Record<string, unknown> | null;
  membership?: {
    id: number;
    role: string;
  };
};

type MediaAccessDenied = {
  allow: false;
  status: 403 | 404;
  error: string;
};

export type MediaAccessResult = MediaAccessAllowed | MediaAccessDenied;

type MediaModifyAccessInput =
  | {
      scope: 'flight-plan-gallery';
      payload: PayloadLike;
      user: UserLike;
      flightPlanId: number;
      ownerIdHint?: number;
      adminMode?: EffectiveAdminMode | null;
    }
  | {
      scope: 'page-gallery';
      payload: PayloadLike;
      user: UserLike;
      pageId: number;
      adminMode?: EffectiveAdminMode | null;
    }
  | {
      scope: 'avatar';
      payload?: PayloadLike;
      user: UserLike;
      ownerUserId: number;
      adminMode?: EffectiveAdminMode | null;
    }
  | {
      scope: 'task-attachment';
      payload: PayloadLike;
      user: UserLike;
      action: 'upload' | 'delete';
      flightPlanId: number;
      ownerIdHint?: number;
      passengersCanCreateTasks: boolean;
      isCrewOnly: boolean;
      taskOwnerMembershipId?: number | null;
      adminMode?: EffectiveAdminMode | null;
    };

type MediaDownloadAccessInput =
  | {
      scope: 'gallery-file';
      payload: PayloadLike;
      user: UserLike;
      relativePath: string;
      fallbackPaths?: readonly string[];
      adminMode?: EffectiveAdminMode | null;
    }
  | {
      scope: 'task-attachment-file';
      payload: PayloadLike;
      user: UserLike;
      relativePath: string;
      fallbackPaths?: readonly string[];
      adminMode?: EffectiveAdminMode | null;
    }
  | {
      scope: 'avatar-file';
      user: UserLike;
      adminMode?: EffectiveAdminMode | null;
    };

type GalleryImageDoc = {
  id?: unknown;
  filename?: unknown;
  flightPlan?: unknown;
  page?: unknown;
};

type TaskAttachmentDoc = {
  id?: unknown;
  filename?: unknown;
  flightPlan?: unknown;
  task?: unknown;
};

type FlightPlanDoc = {
  owner?: unknown;
  accessPolicy?: unknown;
  visibility?: unknown;
  isPublic?: unknown;
  publicContributions?: unknown;
  mediaVisibility?: unknown;
};

type PageDoc = {
  owner?: unknown;
  accessPolicy?: unknown;
};

type FlightPlanTaskDoc = {
  flightPlan?: unknown;
  isCrewOnly?: unknown;
};

const normalizeId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normalizeId((value as { id?: unknown }).id);
  }
  return null;
};

const normalizePath = (value: string): string | null => {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!normalized || normalized.includes('..')) return null;
  return normalized;
};

const decodePathSafely = (value: string): string => {
  const segments = value.split('/');
  return segments
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
};

const collectFilenameCandidates = (
  relativePath: string,
  fallbackPaths: readonly string[],
): string[] => {
  const seen = new Set<string>();
  const candidates: string[] = [];
  const addCandidate = (value: string) => {
    const normalized = normalizePath(value);
    if (!normalized) return;
    const decoded = decodePathSafely(normalized);
    if (!seen.has(decoded)) {
      seen.add(decoded);
      candidates.push(decoded);
    }
    const basename = decoded.split('/').pop()?.trim() ?? '';
    if (basename && !seen.has(basename)) {
      seen.add(basename);
      candidates.push(basename);
    }
  };

  addCandidate(relativePath);
  for (const fallbackPath of fallbackPaths) addCandidate(fallbackPath);
  return candidates;
};

const selectBestDocByFilename = <T extends { filename?: unknown }>(
  docs: T[],
  filenameCandidates: string[],
): T | null => {
  if (!docs.length) return null;
  const scoreByFilename = new Map<string, number>();
  filenameCandidates.forEach((entry, index) => {
    scoreByFilename.set(entry, index);
  });

  const scored = docs
    .map((doc) => {
      const filename = typeof doc.filename === 'string' ? doc.filename.trim() : '';
      const score = scoreByFilename.get(filename) ?? Number.MAX_SAFE_INTEGER;
      return { doc, score };
    })
    .sort((a, b) => a.score - b.score);

  return scored[0]?.doc ?? null;
};

const resolveByFilename = async <T extends { filename?: unknown }>({
  payload,
  collection,
  filenameCandidates,
}: {
  payload: PayloadLike;
  collection: string;
  filenameCandidates: string[];
}): Promise<T | null> => {
  if (!filenameCandidates.length) return null;

  const whereOr = filenameCandidates.map((filename) => ({
    filename: { equals: filename },
  }));
  const where =
    whereOr.length === 1
      ? whereOr[0]
      : {
          or: whereOr,
        };

  const result = (await payload.find({
    collection,
    where,
    depth: 0,
    limit: Math.max(10, filenameCandidates.length),
    overrideAccess: true,
  })) as { docs?: T[] };

  const docs = Array.isArray(result?.docs) ? result.docs : [];
  return selectBestDocByFilename(docs, filenameCandidates);
};

const resolveGalleryImageByFilename = async ({
  payload,
  filenameCandidates,
}: {
  payload: PayloadLike;
  filenameCandidates: string[];
}): Promise<GalleryImageDoc | null> =>
  resolveByFilename<GalleryImageDoc>({
    payload,
    collection: 'gallery-images',
    filenameCandidates,
  });

const resolveTaskAttachmentByFilename = async ({
  payload,
  filenameCandidates,
}: {
  payload: PayloadLike;
  filenameCandidates: string[];
}): Promise<TaskAttachmentDoc | null> =>
  resolveByFilename<TaskAttachmentDoc>({
    payload,
    collection: 'task-attachments',
    filenameCandidates,
  });

const resolveAcceptedMembership = async ({
  payload,
  user,
  flightPlanId,
  ownerIdHint,
  adminMode,
  autoElevateMembership = false,
  logContext,
}: {
  payload: PayloadLike;
  user: UserLike;
  flightPlanId: number;
  ownerIdHint?: number;
  adminMode?: EffectiveAdminMode | null;
  autoElevateMembership?: boolean;
  logContext: string;
}): Promise<{ id: number; role: string } | null> => {
  if (user?.id == null) return null;

  try {
    const resolved = await loadMembershipWithOwnerFallback({
      payload: payload as any,
      flightPlanId,
      userId: user.id,
      ownerIdHint,
    });
    let acceptedMembership = resolved;
    if (
      acceptedMembership?.status !== 'accepted' &&
      autoElevateMembership &&
      hasAdminEditOverrideForUser({
        userId: user.id,
        websiteRole: user?.role ?? null,
        adminMode,
      })
    ) {
      acceptedMembership = await ensureCrewMembership({
        payload: payload as any,
        flightPlanId,
        userId: user.id,
        inviterId: ownerIdHint ?? user.id,
      });
    }
    if (acceptedMembership?.status !== 'accepted') return null;
    const membershipId = normalizeId((acceptedMembership as { id?: unknown }).id);
    if (membershipId == null) return null;
    const role =
      typeof (acceptedMembership as { role?: unknown }).role === 'string'
        ? ((acceptedMembership as { role?: string }).role ?? '').trim()
        : '';
    if (!role) return null;
    return {
      id: membershipId,
      role,
    };
  } catch (error) {
    payload.logger?.warn?.(
      {
        err: error,
        flightPlanId,
        userId: user.id,
      },
      logContext,
    );
    return null;
  }
};

const resolveFlightPlanOwnerId = async ({
  payload,
  flightPlanId,
  notFoundMessage,
}: {
  payload: PayloadLike;
  flightPlanId: number;
  notFoundMessage: string;
}): Promise<{ ownerId: number | null } | MediaAccessDenied> => {
  let flightPlanDoc: FlightPlanDoc;
  try {
    flightPlanDoc = (await payload.findByID({
      collection: 'flight-plans',
      id: flightPlanId,
      depth: 0,
      overrideAccess: true,
    })) as FlightPlanDoc;
  } catch {
    return denied(404, notFoundMessage);
  }

  return {
    ownerId: normalizeId(flightPlanDoc.owner),
  };
};

const denied = (status: 403 | 404, error: string): MediaAccessDenied => ({
  allow: false,
  status,
  error,
});

const isCrewOrOwnerMembership = (membership: { role: string } | null): boolean =>
  membership?.role === 'owner' || membership?.role === 'crew';

const normalizeWebsiteRole = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length ? normalized : null;
};

const buildAuthorizationContext = (
  user: UserLike,
  adminMode?: EffectiveAdminMode | null,
  attributes?: Record<string, boolean>,
) => {
  const actorId = normalizeId(user?.id);
  const adminViewEnabled = adminMode?.adminViewEnabled ?? false;
  const adminEditEnabled = adminMode?.adminEditEnabled ?? false;
  return {
    actor: {
      userId: actorId,
      isAuthenticated: actorId != null,
      websiteRole: normalizeWebsiteRole(user?.role),
    },
    toggles: {
      adminViewEnabled,
      adminEditEnabled,
    },
    attributes: attributes ?? undefined,
  } as const;
};

export { isMediaGovernanceEnforced, resolveMediaGovernanceMode, resolveFlightPlanMediaVisibility };

export const resolveGalleryFileReadAccess = async ({
  payload,
  user,
  relativePath,
  fallbackPaths = [],
  adminMode,
}: {
  payload: PayloadLike;
  user: UserLike;
  relativePath: string;
  fallbackPaths?: readonly string[];
  adminMode?: EffectiveAdminMode | null;
}): Promise<MediaAccessResult> => {
  const filenameCandidates = collectFilenameCandidates(relativePath, fallbackPaths);
  const imageDoc = await resolveGalleryImageByFilename({
    payload,
    filenameCandidates,
  });

  if (!imageDoc) {
    return denied(404, 'Gallery asset not found.');
  }

  const flightPlanId = normalizeId(imageDoc.flightPlan);
  const pageId = normalizeId(imageDoc.page);

  if (flightPlanId != null && pageId != null) {
    return denied(403, 'Gallery asset scope is invalid.');
  }

  if (flightPlanId != null) {
    let flightPlanDoc: FlightPlanDoc;
    try {
      flightPlanDoc = (await payload.findByID({
        collection: 'flight-plans',
        id: flightPlanId,
        depth: 0,
        overrideAccess: true,
      })) as FlightPlanDoc;
    } catch {
      return denied(404, 'Gallery asset not found.');
    }

    const membership = await resolveAcceptedMembership({
      payload,
      user,
      flightPlanId,
      ownerIdHint: normalizeId(flightPlanDoc.owner) ?? undefined,
      adminMode,
      logContext: '[media-access] failed to resolve flight-plan membership for gallery read check',
    });
    const hasAdminEditOverride = hasAdminEditOverrideForUser({
      userId: user?.id ?? null,
      websiteRole: user?.role ?? null,
      adminMode,
    });

    const canRead = canUserReadFlightPlan({
      user,
      ownerId: flightPlanDoc.owner,
      membershipRole: membership?.role ?? null,
      policy: flightPlanDoc.accessPolicy as any,
      visibility: flightPlanDoc.visibility,
      isPublic: flightPlanDoc.isPublic,
      publicContributions: flightPlanDoc.publicContributions,
      adminMode,
    });

    if (!canRead) {
      return denied(403, 'You do not have permission to view this media.');
    }

    const mediaVisibility = resolveFlightPlanMediaVisibility(flightPlanDoc.mediaVisibility);
    if (
      mediaVisibility === 'crew_only' &&
      !isCrewOrOwnerMembership(membership) &&
      !hasAdminEditOverride
    ) {
      return denied(403, 'You do not have permission to view this media.');
    }

    return { allow: true };
  }

  if (pageId != null) {
    let pageDoc: PageDoc;
    try {
      pageDoc = (await payload.findByID({
        collection: 'pages',
        id: pageId,
        depth: 0,
        overrideAccess: true,
      })) as PageDoc;
    } catch {
      return denied(404, 'Gallery asset not found.');
    }

    const canRead = canUserReadCrewPolicy({
      policy: pageDoc.accessPolicy as any,
      user,
      ownerId: pageDoc.owner,
      fallbackPolicy: { mode: 'public' },
      adminMode,
    });
    return canRead
      ? { allow: true }
      : denied(403, 'You do not have permission to view this media.');
  }

  return denied(403, 'Gallery asset is not attached to a governed owner.');
};

export const resolveTaskAttachmentFileReadAccess = async ({
  payload,
  user,
  relativePath,
  fallbackPaths = [],
  adminMode,
}: {
  payload: PayloadLike;
  user: UserLike;
  relativePath: string;
  fallbackPaths?: readonly string[];
  adminMode?: EffectiveAdminMode | null;
}): Promise<MediaAccessResult> => {
  const filenameCandidates = collectFilenameCandidates(relativePath, fallbackPaths);
  const attachmentDoc = await resolveTaskAttachmentByFilename({
    payload,
    filenameCandidates,
  });
  if (!attachmentDoc) {
    return denied(404, 'Task attachment not found.');
  }

  const flightPlanId = normalizeId(attachmentDoc.flightPlan);
  const taskId = normalizeId(attachmentDoc.task);
  if (flightPlanId == null || taskId == null) {
    return denied(403, 'Task attachment scope is invalid.');
  }

  let flightPlanDoc: FlightPlanDoc;
  try {
    flightPlanDoc = (await payload.findByID({
      collection: 'flight-plans',
      id: flightPlanId,
      depth: 0,
      overrideAccess: true,
    })) as FlightPlanDoc;
  } catch {
    return denied(404, 'Task attachment not found.');
  }

  let taskDoc: FlightPlanTaskDoc;
  try {
    taskDoc = (await payload.findByID({
      collection: 'flight-plan-tasks',
      id: taskId,
      depth: 0,
      overrideAccess: true,
    })) as FlightPlanTaskDoc;
  } catch {
    return denied(404, 'Task attachment not found.');
  }

  const taskFlightPlanId = normalizeId(taskDoc.flightPlan);
  if (taskFlightPlanId == null || taskFlightPlanId !== flightPlanId) {
    return denied(403, 'Task attachment scope is invalid.');
  }

  const membership = await resolveAcceptedMembership({
    payload,
    user,
    flightPlanId,
    ownerIdHint: normalizeId(flightPlanDoc.owner) ?? undefined,
    adminMode,
    logContext:
      '[media-access] failed to resolve flight-plan membership for task attachment read check',
  });
  const hasAdminEditOverride = hasAdminEditOverrideForUser({
    userId: user?.id ?? null,
    websiteRole: user?.role ?? null,
    adminMode,
  });

  const canReadFlightPlan = canUserReadFlightPlan({
    user,
    ownerId: flightPlanDoc.owner,
    membershipRole: membership?.role ?? null,
    policy: flightPlanDoc.accessPolicy as any,
    visibility: flightPlanDoc.visibility,
    isPublic: flightPlanDoc.isPublic,
    publicContributions: flightPlanDoc.publicContributions,
    adminMode,
  });

  if (!canReadFlightPlan) {
    return denied(403, 'You do not have permission to view this media.');
  }

  const mediaVisibility = resolveFlightPlanMediaVisibility(flightPlanDoc.mediaVisibility);
  if (
    mediaVisibility === 'crew_only' &&
    !isCrewOrOwnerMembership(membership) &&
    !hasAdminEditOverride
  ) {
    return denied(403, 'You do not have permission to view this media.');
  }

  if (
    Boolean(taskDoc.isCrewOnly) &&
    !isCrewOrOwnerMembership(membership) &&
    !hasAdminEditOverride
  ) {
    return denied(403, 'You do not have permission to view this media.');
  }

  return { allow: true };
};

export const resolveMediaModifyAccess = async (
  input: MediaModifyAccessInput,
): Promise<MediaAccessResult> => {
  const governanceMode = resolveMediaGovernanceMode();

  const auditModifyResult = (
    scope: string,
    user: UserLike,
    result: MediaAccessResult,
    payload?: PayloadLike,
  ) => {
    recordMediaGovernanceAudit({
      payload: payload as any,
      user,
      scope,
      action: 'modify',
      decision: result.allow ? 'allow' : 'deny',
      mode: governanceMode,
      status: result.allow ? null : result.status,
      reason: result.allow ? null : result.error,
    });
    return result;
  };

  if (input.scope === 'avatar') {
    const result =
      input.user?.id != null && Number(input.user.id) === input.ownerUserId
        ? ({ allow: true } as MediaAccessResult)
        : denied(403, 'You do not have permission to modify this media.');
    return auditModifyResult('avatar', input.user, result, input.payload);
  }

  if (input.scope === 'flight-plan-gallery') {
    if (input.user?.id == null) {
      return auditModifyResult(
        'flight-plan-gallery',
        input.user,
        denied(403, 'You do not have permission to modify this media.'),
        input.payload,
      );
    }
    const canManage = await canEditFlightPlan({
      payload: input.payload as any,
      flightPlanId: input.flightPlanId,
      userId: input.user.id,
      ownerIdHint: input.ownerIdHint,
      websiteRole: input.user.role,
      adminMode: input.adminMode,
    });
    const result = canManage
      ? ({ allow: true } as MediaAccessResult)
      : denied(403, 'You do not have permission to modify this media.');
    return auditModifyResult('flight-plan-gallery', input.user, result, input.payload);
  }

  if (input.scope === 'task-attachment') {
    if (input.user?.id == null) {
      return auditModifyResult(
        'task-attachment',
        input.user,
        denied(403, 'Crew access required.'),
        input.payload,
      );
    }

    const membership = await resolveAcceptedMembership({
      payload: input.payload,
      user: input.user,
      flightPlanId: input.flightPlanId,
      ownerIdHint: input.ownerIdHint,
      adminMode: input.adminMode,
      autoElevateMembership: true,
      logContext:
        '[media-access] failed to resolve flight-plan membership for task attachment modify check',
    });
    if (!membership) {
      return auditModifyResult(
        'task-attachment',
        input.user,
        denied(403, 'Crew access required.'),
        input.payload,
      );
    }

    const viewerIsCrew = membership.role === 'owner' || membership.role === 'crew';
    if (viewerIsCrew) {
      return auditModifyResult(
        'task-attachment',
        input.user,
        { allow: true, membership },
        input.payload,
      );
    }

    const viewerIsPassengerContributor =
      membership.role === 'guest' && input.passengersCanCreateTasks;
    if (!viewerIsPassengerContributor) {
      return auditModifyResult(
        'task-attachment',
        input.user,
        denied(
          403,
          input.action === 'upload'
            ? 'Only captains or crew organisers can attach files.'
            : 'Only captains, crew organisers, or the task owner can remove attachments.',
        ),
        input.payload,
      );
    }

    if (input.isCrewOnly) {
      return auditModifyResult(
        'task-attachment',
        input.user,
        denied(403, 'Crew-only tasks limit attachments to captains and crew organisers.'),
        input.payload,
      );
    }

    if (input.action === 'delete') {
      const ownerMembershipId = normalizeId(input.taskOwnerMembershipId);
      if (ownerMembershipId == null || membership.id !== ownerMembershipId) {
        return auditModifyResult(
          'task-attachment',
          input.user,
          denied(403, 'Only captains, crew organisers, or the task owner can remove attachments.'),
          input.payload,
        );
      }
    }

    return auditModifyResult(
      'task-attachment',
      input.user,
      { allow: true, membership },
      input.payload,
    );
  }

  const pageAccess = await resolvePageEditAccess({
    payload: input.payload as any,
    pageId: input.pageId,
    user: input.user as any,
    adminMode: input.adminMode,
  });
  if (!pageAccess.page) {
    return auditModifyResult(
      'page-gallery',
      input.user,
      denied(404, 'Page not found.'),
      input.payload,
    );
  }
  const result = pageAccess.canEdit
    ? ({ allow: true, page: pageAccess.page as Record<string, unknown> | null } as MediaAccessResult)
    : denied(403, 'You do not have permission to modify this media.');
  return auditModifyResult('page-gallery', input.user, result, input.payload);
};

export const resolveMediaDownloadAccess = async (
  input: MediaDownloadAccessInput,
): Promise<MediaAccessResult> => {
  const baseAuthContext = buildAuthorizationContext(input.user, input.adminMode);
  const hasAdminReadOverride = can('adminReadAllContent', baseAuthContext);
  if (hasAdminReadOverride) {
    recordAuthorizationDecision({
      payload: 'payload' in input ? input.payload : null,
      capability: 'adminReadAllContent',
      allowed: true,
      reasonCode: 'allow_admin_read_override',
      actorId: input.user?.id ?? null,
      actorRole: input.user?.role ?? null,
      resourceType: input.scope,
      resourceId: null,
      resourceSlug: null,
      metadata: {
        adminViewEnabled: input.adminMode?.adminViewEnabled ?? false,
        adminEditEnabled: input.adminMode?.adminEditEnabled ?? false,
      },
    });
    recordMediaGovernanceAudit({
      payload: 'payload' in input ? input.payload : undefined,
      user: input.user,
      scope: input.scope,
      action: 'download',
      decision: 'allow',
      mode: resolveMediaGovernanceMode(),
      relativePath: 'relativePath' in input ? input.relativePath : null,
      metadata: {
        capability: 'adminReadAllContent',
        adminViewEnabled: input.adminMode?.adminViewEnabled ?? false,
        adminEditEnabled: input.adminMode?.adminEditEnabled ?? false,
      },
    });
    return { allow: true };
  }

  if (input.scope === 'avatar-file') {
    recordAuthorizationDecision({
      payload: null,
      capability: 'downloadMedia',
      allowed: false,
      reasonCode: 'deny_avatar_download_admin_required',
      actorId: input.user?.id ?? null,
      actorRole: input.user?.role ?? null,
      resourceType: input.scope,
      resourceId: null,
      resourceSlug: null,
    });
    return denied(403, 'You do not have permission to download this media.');
  }

  if (input.scope === 'gallery-file') {
    const filenameCandidates = collectFilenameCandidates(
      input.relativePath,
      input.fallbackPaths ?? [],
    );
    const imageDoc = await resolveGalleryImageByFilename({
      payload: input.payload,
      filenameCandidates,
    });

    if (!imageDoc) {
      return denied(404, 'Gallery asset not found.');
    }

    const flightPlanId = normalizeId(imageDoc.flightPlan);
    const pageId = normalizeId(imageDoc.page);
    if (flightPlanId != null && pageId != null) {
      return denied(403, 'Gallery asset scope is invalid.');
    }
    if (flightPlanId == null) {
      return denied(403, 'You do not have permission to download this media.');
    }

    const owner = await resolveFlightPlanOwnerId({
      payload: input.payload,
      flightPlanId,
      notFoundMessage: 'Gallery asset not found.',
    });
    if (!('ownerId' in owner)) {
      return owner;
    }

    const canDownload = can(
      'downloadMedia',
      buildAuthorizationContext(input.user, input.adminMode, {
        downloadMedia:
          normalizeId(input.user?.id) != null &&
          normalizeId(input.user?.id) === owner.ownerId,
      }),
    );
    recordAuthorizationDecision({
      payload: input.payload,
      capability: 'downloadMedia',
      allowed: canDownload,
      reasonCode: canDownload
        ? 'allow_media_owner_download'
        : 'deny_media_owner_download_required',
      actorId: input.user?.id ?? null,
      actorRole: input.user?.role ?? null,
      resourceType: input.scope,
      resourceId: flightPlanId,
      resourceSlug: null,
      metadata: {
        ownerId: owner.ownerId,
      },
    });
    return canDownload
      ? { allow: true }
      : denied(403, 'You do not have permission to download this media.');
  }

  const filenameCandidates = collectFilenameCandidates(
    input.relativePath,
    input.fallbackPaths ?? [],
  );
  const attachmentDoc = await resolveTaskAttachmentByFilename({
    payload: input.payload,
    filenameCandidates,
  });
  if (!attachmentDoc) {
    return denied(404, 'Task attachment not found.');
  }

  const flightPlanId = normalizeId(attachmentDoc.flightPlan);
  const taskId = normalizeId(attachmentDoc.task);
  if (flightPlanId == null || taskId == null) {
    return denied(403, 'Task attachment scope is invalid.');
  }

  let taskDoc: FlightPlanTaskDoc;
  try {
    taskDoc = (await input.payload.findByID({
      collection: 'flight-plan-tasks',
      id: taskId,
      depth: 0,
      overrideAccess: true,
    })) as FlightPlanTaskDoc;
  } catch {
    return denied(404, 'Task attachment not found.');
  }

  const taskFlightPlanId = normalizeId(taskDoc.flightPlan);
  if (taskFlightPlanId == null || taskFlightPlanId !== flightPlanId) {
    return denied(403, 'Task attachment scope is invalid.');
  }

  const owner = await resolveFlightPlanOwnerId({
    payload: input.payload,
    flightPlanId,
    notFoundMessage: 'Task attachment not found.',
  });
  if (!('ownerId' in owner)) {
    return owner;
  }

  const canDownload = can(
    'downloadMedia',
    buildAuthorizationContext(input.user, input.adminMode, {
      downloadMedia:
        normalizeId(input.user?.id) != null &&
        normalizeId(input.user?.id) === owner.ownerId,
    }),
  );
  recordAuthorizationDecision({
    payload: input.payload,
    capability: 'downloadMedia',
    allowed: canDownload,
    reasonCode: canDownload
      ? 'allow_media_owner_download'
      : 'deny_media_owner_download_required',
    actorId: input.user?.id ?? null,
    actorRole: input.user?.role ?? null,
    resourceType: input.scope,
    resourceId: flightPlanId,
    resourceSlug: null,
    metadata: {
      ownerId: owner.ownerId,
      taskId,
    },
  });
  return canDownload
    ? { allow: true }
    : denied(403, 'You do not have permission to download this media.');
};

export const resolveAvatarFileReadAccess = (): MediaAccessResult => ({ allow: true });
