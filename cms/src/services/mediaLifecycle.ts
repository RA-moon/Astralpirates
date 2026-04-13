import { and, eq, inArray, sql } from '@payloadcms/db-postgres/drizzle';
import { integer, pgTable, timestamp, varchar } from '@payloadcms/db-postgres/drizzle/pg-core';
import type { Payload } from 'payload';

import { media_delete_jobs, media_references } from '@/src/drizzle-schema.ts';
import { normaliseGalleryImageId } from '@/src/lib/galleryReferences';
import { HONOR_BADGE_CODES, resolveHonorBadgeDefinition } from '@astralpirates/shared/honorBadges';

export type MediaAssetClass = 'gallery' | 'task' | 'avatar' | 'badge';
export type MediaOwnerType = 'flight-plan' | 'page' | 'task' | 'user';
export type MediaDeleteMode = 'safe' | 'force';
export type MediaLifecycleState = 'active' | 'pending-delete' | 'deleted';

type MediaReferenceEntry = {
  assetId: number;
  referenceKey?: string | null;
};

type SyncOwnerMediaReferencesInput = {
  payload: Payload;
  assetClass: MediaAssetClass;
  ownerType: MediaOwnerType;
  ownerId: number;
  fieldPath: string;
  references: MediaReferenceEntry[];
  actorUserId?: number | null;
  requestId?: string | null;
};

type QueueMediaDeleteInput = {
  payload: Payload;
  assetClass: MediaAssetClass;
  assetId: number;
  mode: MediaDeleteMode;
  reason: string;
  requestedByUserId?: number | null;
  runAfterIso?: string | null;
};

type ReconcileOptions = {
  dryRun?: boolean;
  pageSize?: number;
  logger?: {
    info?: (meta: Record<string, unknown>, message: string) => void;
    warn?: (meta: Record<string, unknown>, message: string) => void;
  };
};

type ReconcileSummary = {
  dryRun: boolean;
  flightPlansScanned: number;
  pagesScanned: number;
  tasksScanned: number;
  usersScanned: number;
};

type AssetLifecycleTable = any;

const galleryLifecycle = pgTable('gallery_images', {
  id: integer('id').primaryKey(),
  lifecycleState: varchar('lifecycle_state', { length: 16 }).notNull(),
  deleteReason: varchar('delete_reason', { length: 128 }),
  pendingDeleteAt: timestamp('pending_delete_at', {
    mode: 'string',
    withTimezone: true,
    precision: 3,
  }),
  deletedAt: timestamp('deleted_at', { mode: 'string', withTimezone: true, precision: 3 }),
  lifecycleUpdatedAt: timestamp('lifecycle_updated_at', {
    mode: 'string',
    withTimezone: true,
    precision: 3,
  }),
});

const taskLifecycle = pgTable('task_attachments', {
  id: integer('id').primaryKey(),
  lifecycleState: varchar('lifecycle_state', { length: 16 }).notNull(),
  deleteReason: varchar('delete_reason', { length: 128 }),
  pendingDeleteAt: timestamp('pending_delete_at', {
    mode: 'string',
    withTimezone: true,
    precision: 3,
  }),
  deletedAt: timestamp('deleted_at', { mode: 'string', withTimezone: true, precision: 3 }),
  lifecycleUpdatedAt: timestamp('lifecycle_updated_at', {
    mode: 'string',
    withTimezone: true,
    precision: 3,
  }),
});

const avatarLifecycle = pgTable('avatars', {
  id: integer('id').primaryKey(),
  lifecycleState: varchar('lifecycle_state', { length: 16 }).notNull(),
  deleteReason: varchar('delete_reason', { length: 128 }),
  pendingDeleteAt: timestamp('pending_delete_at', {
    mode: 'string',
    withTimezone: true,
    precision: 3,
  }),
  deletedAt: timestamp('deleted_at', { mode: 'string', withTimezone: true, precision: 3 }),
  lifecycleUpdatedAt: timestamp('lifecycle_updated_at', {
    mode: 'string',
    withTimezone: true,
    precision: 3,
  }),
});

const honorBadgeLifecycle = pgTable('honor_badge_media', {
  id: integer('id').primaryKey(),
  lifecycleState: varchar('lifecycle_state', { length: 16 }).notNull(),
  deleteReason: varchar('delete_reason', { length: 128 }),
  pendingDeleteAt: timestamp('pending_delete_at', {
    mode: 'string',
    withTimezone: true,
    precision: 3,
  }),
  deletedAt: timestamp('deleted_at', { mode: 'string', withTimezone: true, precision: 3 }),
  lifecycleUpdatedAt: timestamp('lifecycle_updated_at', {
    mode: 'string',
    withTimezone: true,
    precision: 3,
  }),
});

const DEFAULT_DELETE_SAFETY_WINDOW_SECONDS = 10 * 60;
const DEFAULT_RECONCILE_PAGE_SIZE = 50;

const asObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toNumericId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  const record = asObject(value);
  if (!record || !('id' in record)) return null;
  return toNumericId(record.id);
};

const normalizeReferenceKey = (value: string | null | undefined): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed.length) return '';
  if (trimmed.length <= 128) return trimmed;
  return trimmed.slice(0, 128);
};

const normalizeFieldPath = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed.length) return 'unknown';
  if (trimmed.length <= 128) return trimmed;
  return trimmed.slice(0, 128);
};

const dedupeReferenceEntries = (entries: MediaReferenceEntry[]): MediaReferenceEntry[] => {
  const deduped: MediaReferenceEntry[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const assetId = toNumericId(entry.assetId);
    if (assetId == null) continue;
    const referenceKey = normalizeReferenceKey(entry.referenceKey);
    const key = `${assetId}:${referenceKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({
      assetId,
      referenceKey,
    });
  }

  return deduped;
};

const resolveDb = (payload: Payload) => {
  const db = payload.db?.drizzle;
  if (!db) {
    return null;
  }
  return db;
};

const resolveCollectionForAssetClass = (
  assetClass: MediaAssetClass,
): 'gallery-images' | 'task-attachments' | 'avatars' | 'honor-badge-media' => {
  if (assetClass === 'gallery') return 'gallery-images';
  if (assetClass === 'task') return 'task-attachments';
  if (assetClass === 'badge') return 'honor-badge-media';
  return 'avatars';
};

const resolveAssetLifecycleTable = (assetClass: MediaAssetClass): AssetLifecycleTable => {
  switch (assetClass) {
    case 'gallery':
      return galleryLifecycle;
    case 'task':
      return taskLifecycle;
    case 'avatar':
      return avatarLifecycle;
    case 'badge':
      return honorBadgeLifecycle;
  }
};

const collectGallerySlideReferenceEntries = (
  slides: unknown,
  {
    keyPrefix,
  }: {
    keyPrefix: string;
  },
): MediaReferenceEntry[] => {
  if (!Array.isArray(slides)) return [];
  const refs: MediaReferenceEntry[] = [];

  for (let index = 0; index < slides.length; index += 1) {
    const record = asObject(slides[index]);
    if (!record) continue;
    const assetId = normaliseGalleryImageId(record.galleryImage);
    if (assetId == null) continue;
    const explicitKey = typeof record.id === 'string' ? record.id : null;
    refs.push({
      assetId,
      referenceKey: explicitKey ?? `${keyPrefix}:${index}`,
    });
  }

  return refs;
};

const collectPageGalleryReferenceEntries = (layout: unknown): MediaReferenceEntry[] => {
  if (!Array.isArray(layout)) return [];
  const refs: MediaReferenceEntry[] = [];

  for (let blockIndex = 0; blockIndex < layout.length; blockIndex += 1) {
    const block = asObject(layout[blockIndex]);
    if (!block || block.blockType !== 'imageCarousel') continue;
    refs.push(
      ...collectGallerySlideReferenceEntries(block.slides, {
        keyPrefix: `layout.${blockIndex}.slides`,
      }),
    );
  }

  return refs;
};

const collectTaskAttachmentReferenceEntries = (attachments: unknown): MediaReferenceEntry[] => {
  if (!Array.isArray(attachments)) return [];
  const refs: MediaReferenceEntry[] = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const record = asObject(attachments[index]);
    if (!record) continue;
    const assetId = toNumericId(record.assetId);
    if (assetId == null) continue;
    const explicitKey = typeof record.id === 'string' ? record.id : null;
    refs.push({
      assetId,
      referenceKey: explicitKey ?? `attachments:${index}`,
    });
  }

  return refs;
};

const collectUserHonorBadgeCodes = (honorBadges: unknown): string[] => {
  if (!Array.isArray(honorBadges)) return [];
  const codes = new Set<string>();
  for (const entry of honorBadges) {
    const record = asObject(entry);
    if (!record) continue;
    const definition = resolveHonorBadgeDefinition(record.code);
    if (!definition) continue;
    codes.add(definition.code);
  }
  return Array.from(codes.values());
};

type HonorBadgeAssetIdByCode = Map<string, number>;

const resolveHonorBadgeAssetIdsByCode = async ({
  payload,
  badgeCodes,
}: {
  payload: Payload;
  badgeCodes: string[];
}): Promise<HonorBadgeAssetIdByCode> => {
  const map: HonorBadgeAssetIdByCode = new Map();
  if (badgeCodes.length === 0) return map;

  const result = await payload.find({
    collection: 'honor-badge-media',
    where: {
      badgeCode: {
        in: badgeCodes,
      },
    },
    depth: 0,
    limit: Math.max(20, badgeCodes.length * 2),
    sort: '-updatedAt',
    overrideAccess: true,
  });

  for (const doc of result.docs) {
    const record = asObject(doc);
    if (!record) continue;
    const definition = resolveHonorBadgeDefinition(record.badgeCode);
    if (!definition || map.has(definition.code)) continue;
    const assetId = toNumericId(record.id);
    if (assetId == null) continue;
    map.set(definition.code, assetId);
  }

  return map;
};

const resolveDeleteRunAfterIso = (mode: MediaDeleteMode, explicitRunAfter?: string | null): string => {
  if (typeof explicitRunAfter === 'string' && explicitRunAfter.trim().length > 0) {
    return explicitRunAfter;
  }
  if (mode === 'force') {
    return new Date().toISOString();
  }

  const secondsRaw = Number.parseInt(
    process.env.MEDIA_DELETE_SAFETY_WINDOW_SECONDS ?? `${DEFAULT_DELETE_SAFETY_WINDOW_SECONDS}`,
    10,
  );
  const seconds = Number.isFinite(secondsRaw) && secondsRaw > 0
    ? secondsRaw
    : DEFAULT_DELETE_SAFETY_WINDOW_SECONDS;
  return new Date(Date.now() + seconds * 1000).toISOString();
};

export const resolveMediaAssetClassForCollection = (
  collection: string,
): MediaAssetClass | null => {
  if (collection === 'gallery-images') return 'gallery';
  if (collection === 'task-attachments') return 'task';
  if (collection === 'avatars') return 'avatar';
  if (collection === 'honor-badge-media') return 'badge';
  return null;
};

export const syncOwnerMediaReferences = async ({
  payload,
  assetClass,
  ownerType,
  ownerId,
  fieldPath,
  references,
  actorUserId = null,
  requestId = null,
}: SyncOwnerMediaReferencesInput): Promise<void> => {
  const db = resolveDb(payload);
  if (!db) {
    payload.logger?.warn?.(
      { assetClass, ownerType, ownerId, fieldPath },
      '[media-lifecycle] skipping reference sync because drizzle adapter is unavailable',
    );
    return;
  }
  const normalizedFieldPath = normalizeFieldPath(fieldPath);
  const deduped = dedupeReferenceEntries(references);
  const nowIso = new Date().toISOString();

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({
        id: media_references.id,
        assetId: media_references.assetId,
        referenceKey: media_references.referenceKey,
        active: media_references.active,
      })
      .from(media_references)
      .where(
        and(
          eq(media_references.assetClass, assetClass),
          eq(media_references.ownerType, ownerType),
          eq(media_references.ownerId, ownerId),
          eq(media_references.fieldPath, normalizedFieldPath),
        ),
      );

    const byIdentity = new Map<
      string,
      { id: number; active: boolean }
    >();
    for (const row of existing) {
      const identity = `${row.assetId}:${normalizeReferenceKey(row.referenceKey)}`;
      byIdentity.set(identity, { id: row.id, active: Boolean(row.active) });
    }

    const seen = new Set<string>();
    for (const ref of deduped) {
      const identity = `${ref.assetId}:${normalizeReferenceKey(ref.referenceKey)}`;
      seen.add(identity);

      const existingEntry = byIdentity.get(identity);
      if (existingEntry) {
        await tx
          .update(media_references)
          .set({
            active: true,
            actorUserId,
            requestId,
            updatedAt: nowIso,
          })
          .where(eq(media_references.id, existingEntry.id));
        continue;
      }

      await tx.insert(media_references).values({
        assetClass,
        assetId: ref.assetId,
        ownerType,
        ownerId,
        fieldPath: normalizedFieldPath,
        referenceKey: normalizeReferenceKey(ref.referenceKey),
        active: true,
        actorUserId,
        requestId,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    for (const row of existing) {
      const identity = `${row.assetId}:${normalizeReferenceKey(row.referenceKey)}`;
      if (seen.has(identity) || !row.active) continue;
      await tx
        .update(media_references)
        .set({
          active: false,
          actorUserId,
          requestId,
          updatedAt: nowIso,
        })
        .where(eq(media_references.id, row.id));
    }
  });
};

export const clearOwnerMediaReferences = async ({
  payload,
  assetClass,
  ownerType,
  ownerId,
  fieldPath,
  actorUserId = null,
  requestId = null,
}: Omit<SyncOwnerMediaReferencesInput, 'references'>): Promise<void> =>
  syncOwnerMediaReferences({
    payload,
    assetClass,
    ownerType,
    ownerId,
    fieldPath,
    references: [],
    actorUserId,
    requestId,
  });

export const countActiveMediaReferencesForAsset = async ({
  payload,
  assetClass,
  assetId,
}: {
  payload: Payload;
  assetClass: MediaAssetClass;
  assetId: number;
}): Promise<number> => {
  const db = resolveDb(payload);
  if (!db) {
    payload.logger?.warn?.(
      { assetClass, assetId },
      '[media-lifecycle] skipping active-reference count because drizzle adapter is unavailable',
    );
    return 0;
  }
  const rows = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(media_references)
    .where(
      and(
        eq(media_references.assetClass, assetClass),
        eq(media_references.assetId, assetId),
        eq(media_references.active, true),
      ),
    );

  return Number(rows[0]?.count ?? 0);
};

export const queueMediaDelete = async ({
  payload,
  assetClass,
  assetId,
  mode,
  reason,
  requestedByUserId = null,
  runAfterIso = null,
}: QueueMediaDeleteInput): Promise<{ queued: boolean; missingAsset: boolean }> => {
  const db = resolveDb(payload);
  if (!db) {
    const collection = resolveCollectionForAssetClass(assetClass);
    if (typeof (payload as any).delete === 'function') {
      try {
        await (payload as any).delete({
          collection,
          id: assetId,
          overrideAccess: true,
        });
        return { queued: true, missingAsset: false };
      } catch (error) {
        const status = (error as { status?: unknown } | null | undefined)?.status;
        if (status === 404) {
          return { queued: false, missingAsset: true };
        }
        throw error;
      }
    }

    payload.logger?.warn?.(
      { assetClass, assetId, mode, reason },
      '[media-lifecycle] unable to queue media delete because drizzle adapter is unavailable',
    );
    return { queued: false, missingAsset: false };
  }
  const lifecycleTable = resolveAssetLifecycleTable(assetClass);
  const nowIso = new Date().toISOString();
  const runAfter = resolveDeleteRunAfterIso(mode, runAfterIso);

  const result = await db.transaction(async (tx) => {
    const lifecycleUpdate = await tx
      .update(lifecycleTable)
      .set({
        lifecycleState: 'pending-delete',
        deleteReason: reason,
        pendingDeleteAt: nowIso,
        deletedAt: null,
        lifecycleUpdatedAt: nowIso,
      })
      .where(eq((lifecycleTable as any).id, assetId));

    if (Number(lifecycleUpdate.rowCount ?? 0) === 0) {
      return { queued: false, missingAsset: true };
    }

    const openStates = ['queued', 'running'] as const;
    const openUpdate = await tx
      .update(media_delete_jobs)
      .set({
        deleteMode: mode,
        reason,
        requestedByUserId,
        state: 'queued',
        runAfter,
        startedAt: null,
        finishedAt: null,
        lastError: null,
        updatedAt: nowIso,
      })
      .where(
        and(
          eq(media_delete_jobs.assetClass, assetClass),
          eq(media_delete_jobs.assetId, assetId),
          inArray(media_delete_jobs.state, ['queued', 'running']),
        ),
      );

    if (Number(openUpdate.rowCount ?? 0) === 0) {
      await tx.insert(media_delete_jobs).values({
        assetClass,
        assetId,
        deleteMode: mode,
        reason,
        requestedByUserId,
        state: 'queued',
        attemptCount: 0,
        maxAttempts: 5,
        runAfter,
        startedAt: null,
        finishedAt: null,
        lastError: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    return { queued: true, missingAsset: false };
  });

  return result;
};

export const syncGalleryReferencesForFlightPlan = async ({
  payload,
  flightPlanId,
  slides,
  actorUserId = null,
  requestId = null,
}: {
  payload: Payload;
  flightPlanId: number;
  slides: unknown;
  actorUserId?: number | null;
  requestId?: string | null;
}): Promise<void> =>
  syncOwnerMediaReferences({
    payload,
    assetClass: 'gallery',
    ownerType: 'flight-plan',
    ownerId: flightPlanId,
    fieldPath: 'gallerySlides',
    references: collectGallerySlideReferenceEntries(slides, {
      keyPrefix: 'gallerySlides',
    }),
    actorUserId,
    requestId,
  });

export const syncGalleryReferencesForPage = async ({
  payload,
  pageId,
  layout,
  actorUserId = null,
  requestId = null,
}: {
  payload: Payload;
  pageId: number;
  layout: unknown;
  actorUserId?: number | null;
  requestId?: string | null;
}): Promise<void> =>
  syncOwnerMediaReferences({
    payload,
    assetClass: 'gallery',
    ownerType: 'page',
    ownerId: pageId,
    fieldPath: 'layout.imageCarousel.slides',
    references: collectPageGalleryReferenceEntries(layout),
    actorUserId,
    requestId,
  });

export const syncTaskAttachmentReferencesForTask = async ({
  payload,
  taskId,
  attachments,
  actorUserId = null,
  requestId = null,
}: {
  payload: Payload;
  taskId: number;
  attachments: unknown;
  actorUserId?: number | null;
  requestId?: string | null;
}): Promise<void> =>
  syncOwnerMediaReferences({
    payload,
    assetClass: 'task',
    ownerType: 'task',
    ownerId: taskId,
    fieldPath: 'attachments',
    references: collectTaskAttachmentReferenceEntries(attachments),
    actorUserId,
    requestId,
  });

export const syncAvatarReferenceForUser = async ({
  payload,
  userId,
  avatarId,
  actorUserId = null,
  requestId = null,
}: {
  payload: Payload;
  userId: number;
  avatarId: number | null;
  actorUserId?: number | null;
  requestId?: string | null;
}): Promise<void> =>
  syncOwnerMediaReferences({
    payload,
    assetClass: 'avatar',
    ownerType: 'user',
    ownerId: userId,
    fieldPath: 'avatar',
    references: avatarId == null ? [] : [{ assetId: avatarId, referenceKey: 'avatar' }],
    actorUserId,
    requestId,
  });

export const syncHonorBadgeReferencesForUser = async ({
  payload,
  userId,
  honorBadges,
  actorUserId = null,
  requestId = null,
  badgeAssetIdByCode = null,
}: {
  payload: Payload;
  userId: number;
  honorBadges: unknown;
  actorUserId?: number | null;
  requestId?: string | null;
  badgeAssetIdByCode?: HonorBadgeAssetIdByCode | null;
}): Promise<void> => {
  const badgeCodes = collectUserHonorBadgeCodes(honorBadges);
  const resolvedAssetIds =
    badgeAssetIdByCode ?? (await resolveHonorBadgeAssetIdsByCode({ payload, badgeCodes }));
  const references = badgeCodes
    .map((code) => {
      const assetId = resolvedAssetIds.get(code);
      if (assetId == null) return null;
      return {
        assetId,
        referenceKey: code,
      };
    })
    .filter((entry): entry is { assetId: number; referenceKey: string } => Boolean(entry));

  await syncOwnerMediaReferences({
    payload,
    assetClass: 'badge',
    ownerType: 'user',
    ownerId: userId,
    fieldPath: 'honorBadges',
    references,
    actorUserId,
    requestId,
  });
};

export const reconcileAllMediaReferences = async (
  payload: Payload,
  options: ReconcileOptions = {},
): Promise<ReconcileSummary> => {
  const dryRun = Boolean(options.dryRun);
  const pageSize =
    Number.isFinite(options.pageSize) && (options.pageSize ?? 0) > 0
      ? Math.trunc(options.pageSize as number)
      : DEFAULT_RECONCILE_PAGE_SIZE;
  const logger = options.logger ?? payload.logger ?? {};
  const summary: ReconcileSummary = {
    dryRun,
    flightPlansScanned: 0,
    pagesScanned: 0,
    tasksScanned: 0,
    usersScanned: 0,
  };

  let page = 1;
  while (true) {
    const result = await payload.find({
      collection: 'flight-plans',
      page,
      limit: pageSize,
      depth: 0,
      overrideAccess: true,
    });
    if (!result.docs.length) break;
    for (const doc of result.docs) {
      const docRecord = doc as any;
      const flightPlanId = toNumericId(docRecord?.id);
      if (flightPlanId == null) continue;
      summary.flightPlansScanned += 1;
      if (!dryRun) {
        await syncGalleryReferencesForFlightPlan({
          payload,
          flightPlanId,
          slides: docRecord?.gallerySlides,
        });
      }
    }
    if (page >= result.totalPages) break;
    page += 1;
  }

  const badgeAssetIdByCode =
    dryRun
      ? null
      : await resolveHonorBadgeAssetIdsByCode({
          payload,
          badgeCodes: HONOR_BADGE_CODES,
        });

  page = 1;
  while (true) {
    const result = await payload.find({
      collection: 'pages',
      page,
      limit: pageSize,
      depth: 0,
      overrideAccess: true,
    });
    if (!result.docs.length) break;
    for (const doc of result.docs) {
      const docRecord = doc as any;
      const pageId = toNumericId(docRecord?.id);
      if (pageId == null) continue;
      summary.pagesScanned += 1;
      if (!dryRun) {
        await syncGalleryReferencesForPage({
          payload,
          pageId,
          layout: docRecord?.layout,
        });
      }
    }
    if (page >= result.totalPages) break;
    page += 1;
  }

  page = 1;
  while (true) {
    const result = await payload.find({
      collection: 'flight-plan-tasks',
      page,
      limit: pageSize,
      depth: 0,
      overrideAccess: true,
    });
    if (!result.docs.length) break;
    for (const doc of result.docs) {
      const docRecord = doc as any;
      const taskId = toNumericId(docRecord?.id);
      if (taskId == null) continue;
      summary.tasksScanned += 1;
      if (!dryRun) {
        await syncTaskAttachmentReferencesForTask({
          payload,
          taskId,
          attachments: docRecord?.attachments,
        });
      }
    }
    if (page >= result.totalPages) break;
    page += 1;
  }

  page = 1;
  while (true) {
    const result = await payload.find({
      collection: 'users',
      page,
      limit: pageSize,
      depth: 0,
      overrideAccess: true,
    });
    if (!result.docs.length) break;
    for (const doc of result.docs) {
      const docRecord = doc as any;
      const userId = toNumericId(docRecord?.id);
      if (userId == null) continue;
      summary.usersScanned += 1;
      if (!dryRun) {
        await syncAvatarReferenceForUser({
          payload,
          userId,
          avatarId: toNumericId(docRecord?.avatar),
        });
        await syncHonorBadgeReferencesForUser({
          payload,
          userId,
          honorBadges: docRecord?.honorBadges,
          badgeAssetIdByCode,
        });
      }
    }
    if (page >= result.totalPages) break;
    page += 1;
  }

  logger.info?.(
    {
      dryRun: summary.dryRun,
      flightPlansScanned: summary.flightPlansScanned,
      pagesScanned: summary.pagesScanned,
      tasksScanned: summary.tasksScanned,
      usersScanned: summary.usersScanned,
    },
    '[media-lifecycle] reconcile pass complete',
  );

  return summary;
};

export const processMediaDeleteQueueOnce = async ({
  payload,
  limit = 20,
}: {
  payload: Payload;
  limit?: number;
}): Promise<{
  scanned: number;
  succeeded: number;
  retried: number;
  deadLettered: number;
}> => {
  const db = resolveDb(payload);
  if (!db) {
    throw new Error('Payload database adapter is unavailable for media delete queue processing.');
  }
  const nowIso = new Date().toISOString();
  const summary = {
    scanned: 0,
    succeeded: 0,
    retried: 0,
    deadLettered: 0,
  };

  const rows = await db
    .select()
    .from(media_delete_jobs)
    .where(
      and(
        eq(media_delete_jobs.state, 'queued'),
        sql`${media_delete_jobs.runAfter} <= ${nowIso}`,
      ),
    )
    .orderBy(media_delete_jobs.createdAt)
    .limit(limit);

  for (const row of rows) {
    summary.scanned += 1;
    const attempt = Number(row.attemptCount ?? 0) + 1;
    const claimed = await db
      .update(media_delete_jobs)
      .set({
        state: 'running',
        attemptCount: attempt,
        startedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(
        and(eq(media_delete_jobs.id, row.id), eq(media_delete_jobs.state, 'queued')),
      );
    if (Number(claimed.rowCount ?? 0) === 0) continue;

    const assetClass = row.assetClass as MediaAssetClass;
    const lifecycleTable = resolveAssetLifecycleTable(assetClass);
    const assetId = Number(row.assetId);

    try {
      const activeRefs = await countActiveMediaReferencesForAsset({
        payload,
        assetClass,
        assetId,
      });
      if (row.deleteMode !== 'force' && activeRefs > 0) {
        if (attempt >= Number(row.maxAttempts ?? 5)) {
          await db
            .update(media_delete_jobs)
            .set({
              state: 'dead-letter',
              finishedAt: nowIso,
              lastError: `Asset still has ${activeRefs} active references.`,
              updatedAt: nowIso,
            })
            .where(eq(media_delete_jobs.id, row.id));
          summary.deadLettered += 1;
          continue;
        }

        const retryAfter = new Date(Date.now() + Math.min(3600, 30 * 2 ** attempt) * 1000).toISOString();
        await db
          .update(media_delete_jobs)
          .set({
            state: 'queued',
            runAfter: retryAfter,
            lastError: `Asset still has ${activeRefs} active references.`,
            updatedAt: nowIso,
          })
          .where(eq(media_delete_jobs.id, row.id));
        summary.retried += 1;
        continue;
      }

      const collection = resolveCollectionForAssetClass(assetClass);

      await payload.delete({
        collection,
        id: assetId,
        overrideAccess: true,
      });

      await db
        .update(media_references)
        .set({
          active: false,
          updatedAt: nowIso,
        })
        .where(
          and(
            eq(media_references.assetClass, assetClass),
            eq(media_references.assetId, assetId),
          ),
        );

      await db
        .update(media_delete_jobs)
        .set({
          state: 'succeeded',
          finishedAt: nowIso,
          lastError: null,
          updatedAt: nowIso,
        })
        .where(eq(media_delete_jobs.id, row.id));
      summary.succeeded += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const maxAttempts = Number(row.maxAttempts ?? 5);
      if (attempt >= maxAttempts) {
        await db
          .update(media_delete_jobs)
          .set({
            state: 'dead-letter',
            finishedAt: nowIso,
            lastError: message,
            updatedAt: nowIso,
          })
          .where(eq(media_delete_jobs.id, row.id));
        summary.deadLettered += 1;
        continue;
      }

      const retryAfter = new Date(Date.now() + Math.min(3600, 30 * 2 ** attempt) * 1000).toISOString();
      await db
        .update(media_delete_jobs)
        .set({
          state: 'queued',
          runAfter: retryAfter,
          lastError: message,
          updatedAt: nowIso,
        })
        .where(eq(media_delete_jobs.id, row.id));
      summary.retried += 1;
    }
  }

  return summary;
};
