import { createHash } from 'node:crypto';
import { sql } from '@payloadcms/db-postgres';
import type { Payload } from 'payload';
import type { EffectiveAdminMode } from '@astralpirates/shared/adminMode';

import type { User } from '@/payload-types';
import { canEditFlightPlan, normaliseId } from './flightPlanMembers';
import { resolvePageEditAccess } from './pageEditorAccess';

export type EditorDocumentType = 'flight-plan' | 'page';
export type EditorLockMode = 'soft' | 'hard';

export type EditorAccessResult = {
  exists: boolean;
  canEdit: boolean;
};

export type EditorRevisionRecord = {
  documentType: EditorDocumentType;
  documentId: number;
  revision: number;
  updatedAt: string;
};

export type EditorLockRecord = {
  documentType: EditorDocumentType;
  documentId: number;
  lockMode: EditorLockMode;
  holderUserId: number;
  holderSessionId: string;
  acquiredAt: string;
  expiresAt: string;
  lastHeartbeatAt: string;
  takeoverReason: string | null;
};

export type EditorAcquireResult =
  | {
      status: 'acquired';
      lock: EditorLockRecord;
      reacquired: boolean;
      tookExpiredLock: boolean;
    }
  | {
      status: 'locked';
      lock: EditorLockRecord;
    };

export type EditorTakeoverResult =
  | {
      status: 'taken_over';
      lock: EditorLockRecord;
    }
  | {
      status: 'not_found';
    }
  | {
      status: 'not_expired';
      lock: EditorLockRecord;
    };

export type EditorIdempotencyBeginResult =
  | { status: 'new' }
  | {
      status: 'replay';
      responseStatus: number;
      responseBody: unknown;
      resultingRevision: number | null;
    }
  | {
      status: 'conflict';
      message: string;
    }
  | {
      status: 'in_progress';
    };

export type EditorIdempotencyCleanupResult = {
  retentionDays: number;
  batchSize: number;
  maxBatches: number;
  deletedCount: number;
  reachedBatchLimit: boolean;
};

const REVISION_TABLE = sql.raw('"public"."editor_document_revisions"');
const LOCKS_TABLE = sql.raw('"public"."editor_document_locks"');
const IDEMPOTENCY_TABLE = sql.raw('"public"."editor_write_idempotency"');

const EDITOR_DOCUMENT_TYPES = new Set<EditorDocumentType>(['flight-plan', 'page']);
const EDITOR_LOCK_MODES = new Set<EditorLockMode>(['soft', 'hard']);

const DEFAULT_LOCK_LEASE_SECONDS = 90;
const MIN_LOCK_LEASE_SECONDS = 30;
const MAX_LOCK_LEASE_SECONDS = 300;
const MAX_SESSION_ID_LENGTH = 128;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const DEFAULT_IDEMPOTENCY_RETENTION_DAYS = 14;
const MIN_IDEMPOTENCY_RETENTION_DAYS = 1;
const MAX_IDEMPOTENCY_RETENTION_DAYS = 180;
const DEFAULT_IDEMPOTENCY_CLEANUP_BATCH_SIZE = 500;
const MIN_IDEMPOTENCY_CLEANUP_BATCH_SIZE = 1;
const MAX_IDEMPOTENCY_CLEANUP_BATCH_SIZE = 5_000;
const DEFAULT_IDEMPOTENCY_CLEANUP_MAX_BATCHES = 40;
const MIN_IDEMPOTENCY_CLEANUP_MAX_BATCHES = 1;
const MAX_IDEMPOTENCY_CLEANUP_MAX_BATCHES = 500;

const requireDrizzle = (payload: Payload) => {
  const drizzle = payload.db?.drizzle;
  if (!drizzle) {
    throw new Error('Payload drizzle adapter is required for editor consistency operations.');
  }
  return drizzle;
};

const parsePositiveInt = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const int = Math.trunc(value);
    return int > 0 ? int : null;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const parseNumericValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

const toIsoString = (value: unknown): string =>
  typeof value === 'string' && value.trim().length > 0
    ? value
    : new Date().toISOString();

const toEditorLockRecord = (row: Record<string, unknown> | null | undefined): EditorLockRecord | null => {
  if (!row) return null;

  const documentId = parsePositiveInt(row.document_id);
  const holderUserId = parsePositiveInt(row.holder_user_id);
  const documentType = normaliseEditorDocumentType(row.document_type);
  const lockMode = normaliseEditorLockMode(row.lock_mode) ?? 'soft';
  const holderSessionId = sanitiseEditorSessionId(row.holder_session_id);

  if (!documentId || !holderUserId || !documentType || !holderSessionId) {
    return null;
  }

  return {
    documentType,
    documentId,
    lockMode,
    holderUserId,
    holderSessionId,
    acquiredAt: toIsoString(row.acquired_at),
    expiresAt: toIsoString(row.expires_at),
    lastHeartbeatAt: toIsoString(row.last_heartbeat_at),
    takeoverReason:
      typeof row.takeover_reason === 'string' && row.takeover_reason.trim().length > 0
        ? row.takeover_reason
        : null,
  };
};

const clampLeaseSeconds = (value: unknown): number => {
  const parsed = parsePositiveInt(value);
  if (!parsed) return DEFAULT_LOCK_LEASE_SECONDS;
  return Math.min(MAX_LOCK_LEASE_SECONDS, Math.max(MIN_LOCK_LEASE_SECONDS, parsed));
};

const clampIdempotencyRetentionDays = (value: unknown): number => {
  const parsed = parsePositiveInt(value);
  if (!parsed) return DEFAULT_IDEMPOTENCY_RETENTION_DAYS;
  return Math.min(
    MAX_IDEMPOTENCY_RETENTION_DAYS,
    Math.max(MIN_IDEMPOTENCY_RETENTION_DAYS, parsed),
  );
};

const clampIdempotencyCleanupBatchSize = (value: unknown): number => {
  const parsed = parsePositiveInt(value);
  if (!parsed) return DEFAULT_IDEMPOTENCY_CLEANUP_BATCH_SIZE;
  return Math.min(
    MAX_IDEMPOTENCY_CLEANUP_BATCH_SIZE,
    Math.max(MIN_IDEMPOTENCY_CLEANUP_BATCH_SIZE, parsed),
  );
};

const clampIdempotencyCleanupMaxBatches = (value: unknown): number => {
  const parsed = parsePositiveInt(value);
  if (!parsed) return DEFAULT_IDEMPOTENCY_CLEANUP_MAX_BATCHES;
  return Math.min(
    MAX_IDEMPOTENCY_CLEANUP_MAX_BATCHES,
    Math.max(MIN_IDEMPOTENCY_CLEANUP_MAX_BATCHES, parsed),
  );
};

export const normaliseEditorDocumentType = (value: unknown): EditorDocumentType | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!EDITOR_DOCUMENT_TYPES.has(trimmed as EditorDocumentType)) return null;
  return trimmed as EditorDocumentType;
};

export const normaliseEditorLockMode = (value: unknown): EditorLockMode | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!EDITOR_LOCK_MODES.has(trimmed as EditorLockMode)) return null;
  return trimmed as EditorLockMode;
};

export const sanitiseEditorSessionId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= MAX_SESSION_ID_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_SESSION_ID_LENGTH);
};

export const sanitiseEditorIdempotencyKey = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= MAX_IDEMPOTENCY_KEY_LENGTH) return trimmed;
  return trimmed.slice(0, MAX_IDEMPOTENCY_KEY_LENGTH);
};

export const buildEditorDocumentEtag = ({
  documentType,
  documentId,
  revision,
}: {
  documentType: EditorDocumentType;
  documentId: number;
  revision: number;
}): string => `W/"doc:${documentType}:${documentId}:${revision}"`;

export const parseEditorDocumentEtag = (
  value: unknown,
): { documentType: EditorDocumentType; documentId: number; revision: number } | null => {
  if (typeof value !== 'string') return null;
  let trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('W/')) {
    trimmed = trimmed.slice(2).trim();
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    trimmed = trimmed.slice(1, -1);
  }

  const [prefix, rawDocumentType, rawDocumentId, rawRevision] = trimmed.split(':');
  if (prefix !== 'doc') return null;

  const documentType = normaliseEditorDocumentType(rawDocumentType);
  const documentId = parsePositiveInt(rawDocumentId);
  const revision = parsePositiveInt(rawRevision);
  if (!documentType || !documentId || !revision) return null;

  return {
    documentType,
    documentId,
    revision,
  };
};

export const resolveEditorBaseRevision = ({
  baseRevision,
  ifMatch,
  documentType,
  documentId,
}: {
  baseRevision?: unknown;
  ifMatch?: unknown;
  documentType: EditorDocumentType;
  documentId: number;
}): number | null => {
  const explicit = parsePositiveInt(baseRevision);
  if (explicit) return explicit;

  const parsedEtag = parseEditorDocumentEtag(ifMatch);
  if (!parsedEtag) return null;
  if (parsedEtag.documentType !== documentType || parsedEtag.documentId !== documentId) {
    return null;
  }
  return parsedEtag.revision;
};

export const hashEditorMutationPayload = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');

export const hashEditorLogToken = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return createHash('sha256').update(trimmed).digest('hex').slice(0, 16);
};

export const resolveEditorDocumentEditAccess = async ({
  payload,
  user,
  documentType,
  documentId,
  adminMode,
}: {
  payload: Payload;
  user: User | null | undefined;
  documentType: EditorDocumentType;
  documentId: number;
  adminMode?: EffectiveAdminMode | null;
}): Promise<EditorAccessResult> => {
  if (!user) {
    return { exists: true, canEdit: false };
  }

  if (documentType === 'flight-plan') {
    let flightPlanDoc: { owner?: unknown } | null = null;
    try {
      flightPlanDoc = (await payload.findByID({
        collection: 'flight-plans',
        id: documentId,
        depth: 0,
        overrideAccess: true,
      })) as unknown as { owner?: unknown };
    } catch {
      return { exists: false, canEdit: false };
    }

    const ownerId = normaliseId(flightPlanDoc.owner);
    const canEdit = await canEditFlightPlan({
      payload,
      flightPlanId: documentId,
      userId: user.id,
      ownerIdHint: ownerId ?? undefined,
      websiteRole: user.role,
      adminMode,
    });

    return {
      exists: true,
      canEdit,
    };
  }

  const pageAccess = await resolvePageEditAccess({
    payload,
    pageId: documentId,
    user,
    adminMode,
  });

  return {
    exists: Boolean(pageAccess.page),
    canEdit: Boolean(pageAccess.page) && pageAccess.canEdit,
  };
};

export const ensureEditorDocumentRevision = async ({
  payload,
  documentType,
  documentId,
}: {
  payload: Payload;
  documentType: EditorDocumentType;
  documentId: number;
}): Promise<EditorRevisionRecord> => {
  const drizzle = requireDrizzle(payload);

  await drizzle.execute(sql`
    INSERT INTO ${REVISION_TABLE} ("document_type", "document_id", "revision", "updated_at")
    VALUES (${documentType}, ${documentId}, 1, NOW())
    ON CONFLICT ("document_type", "document_id") DO NOTHING;
  `);

  const rows = await drizzle.execute(sql`
    SELECT "document_type", "document_id", "revision", "updated_at"
    FROM ${REVISION_TABLE}
    WHERE "document_type" = ${documentType} AND "document_id" = ${documentId}
    LIMIT 1;
  `);

  const row = rows.rows[0] as Record<string, unknown> | undefined;
  const revision = parsePositiveInt(row?.revision) ?? 1;

  return {
    documentType,
    documentId,
    revision,
    updatedAt: toIsoString(row?.updated_at),
  };
};

export const bumpEditorDocumentRevision = async ({
  payload,
  documentType,
  documentId,
  expectedRevision,
}: {
  payload: Payload;
  documentType: EditorDocumentType;
  documentId: number;
  expectedRevision: number;
}): Promise<EditorRevisionRecord | null> => {
  const drizzle = requireDrizzle(payload);

  const rows = await drizzle.execute(sql`
    UPDATE ${REVISION_TABLE}
    SET
      "revision" = "revision" + 1,
      "updated_at" = NOW()
    WHERE
      "document_type" = ${documentType}
      AND "document_id" = ${documentId}
      AND "revision" = ${expectedRevision}
    RETURNING "document_type", "document_id", "revision", "updated_at";
  `);

  const row = rows.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const revision = parsePositiveInt(row.revision);
  if (!revision) return null;

  return {
    documentType,
    documentId,
    revision,
    updatedAt: toIsoString(row.updated_at),
  };
};

const loadEditorLock = async ({
  payload,
  documentType,
  documentId,
}: {
  payload: Payload;
  documentType: EditorDocumentType;
  documentId: number;
}): Promise<EditorLockRecord | null> => {
  const drizzle = requireDrizzle(payload);
  const rows = await drizzle.execute(sql`
    SELECT
      "document_type",
      "document_id",
      "lock_mode",
      "holder_user_id",
      "holder_session_id",
      "acquired_at",
      "expires_at",
      "last_heartbeat_at",
      "takeover_reason"
    FROM ${LOCKS_TABLE}
    WHERE "document_type" = ${documentType} AND "document_id" = ${documentId}
    LIMIT 1;
  `);

  return toEditorLockRecord(rows.rows[0] as Record<string, unknown> | undefined);
};

export const acquireEditorDocumentLock = async ({
  payload,
  documentType,
  documentId,
  holderUserId,
  holderSessionId,
  lockMode = 'soft',
  leaseSeconds = DEFAULT_LOCK_LEASE_SECONDS,
}: {
  payload: Payload;
  documentType: EditorDocumentType;
  documentId: number;
  holderUserId: number;
  holderSessionId: string;
  lockMode?: EditorLockMode;
  leaseSeconds?: number;
}): Promise<EditorAcquireResult> => {
  const drizzle = requireDrizzle(payload);
  const lease = clampLeaseSeconds(leaseSeconds);

  await drizzle.execute(sql`
    DELETE FROM ${LOCKS_TABLE}
    WHERE
      "document_type" = ${documentType}
      AND "document_id" = ${documentId}
      AND "expires_at" <= NOW();
  `);

  const inserted = await drizzle.execute(sql`
    INSERT INTO ${LOCKS_TABLE} (
      "document_type",
      "document_id",
      "lock_mode",
      "holder_user_id",
      "holder_session_id",
      "acquired_at",
      "expires_at",
      "last_heartbeat_at"
    )
    VALUES (
      ${documentType},
      ${documentId},
      ${lockMode},
      ${holderUserId},
      ${holderSessionId},
      NOW(),
      NOW() + make_interval(secs => ${lease}),
      NOW()
    )
    ON CONFLICT ("document_type", "document_id") DO NOTHING
    RETURNING
      "document_type",
      "document_id",
      "lock_mode",
      "holder_user_id",
      "holder_session_id",
      "acquired_at",
      "expires_at",
      "last_heartbeat_at",
      "takeover_reason";
  `);

  const insertedLock = toEditorLockRecord(
    inserted.rows[0] as Record<string, unknown> | undefined,
  );
  if (insertedLock) {
    return {
      status: 'acquired',
      lock: insertedLock,
      reacquired: false,
      tookExpiredLock: false,
    };
  }

  const existing = await loadEditorLock({ payload, documentType, documentId });
  if (!existing) {
    const fallback = await acquireEditorDocumentLock({
      payload,
      documentType,
      documentId,
      holderUserId,
      holderSessionId,
      lockMode,
      leaseSeconds: lease,
    });
    return fallback;
  }

  const sameHolder =
    existing.holderUserId === holderUserId && existing.holderSessionId === holderSessionId;

  if (sameHolder) {
    const updated = await drizzle.execute(sql`
      UPDATE ${LOCKS_TABLE}
      SET
        "lock_mode" = ${lockMode},
        "expires_at" = NOW() + make_interval(secs => ${lease}),
        "last_heartbeat_at" = NOW(),
        "takeover_reason" = NULL
      WHERE
        "document_type" = ${documentType}
        AND "document_id" = ${documentId}
        AND "holder_user_id" = ${holderUserId}
        AND "holder_session_id" = ${holderSessionId}
      RETURNING
        "document_type",
        "document_id",
        "lock_mode",
        "holder_user_id",
        "holder_session_id",
        "acquired_at",
        "expires_at",
        "last_heartbeat_at",
        "takeover_reason";
    `);

    const lock = toEditorLockRecord(updated.rows[0] as Record<string, unknown> | undefined);
    if (lock) {
      return {
        status: 'acquired',
        lock,
        reacquired: true,
        tookExpiredLock: false,
      };
    }
  }

  return {
    status: 'locked',
    lock: existing,
  };
};

export const heartbeatEditorDocumentLock = async ({
  payload,
  documentType,
  documentId,
  holderUserId,
  holderSessionId,
  leaseSeconds = DEFAULT_LOCK_LEASE_SECONDS,
}: {
  payload: Payload;
  documentType: EditorDocumentType;
  documentId: number;
  holderUserId: number;
  holderSessionId: string;
  leaseSeconds?: number;
}): Promise<EditorLockRecord | null> => {
  const drizzle = requireDrizzle(payload);
  const lease = clampLeaseSeconds(leaseSeconds);

  const updated = await drizzle.execute(sql`
    UPDATE ${LOCKS_TABLE}
    SET
      "expires_at" = NOW() + make_interval(secs => ${lease}),
      "last_heartbeat_at" = NOW()
    WHERE
      "document_type" = ${documentType}
      AND "document_id" = ${documentId}
      AND "holder_user_id" = ${holderUserId}
      AND "holder_session_id" = ${holderSessionId}
    RETURNING
      "document_type",
      "document_id",
      "lock_mode",
      "holder_user_id",
      "holder_session_id",
      "acquired_at",
      "expires_at",
      "last_heartbeat_at",
      "takeover_reason";
  `);

  return toEditorLockRecord(updated.rows[0] as Record<string, unknown> | undefined);
};

export const releaseEditorDocumentLock = async ({
  payload,
  documentType,
  documentId,
  holderUserId,
  holderSessionId,
}: {
  payload: Payload;
  documentType: EditorDocumentType;
  documentId: number;
  holderUserId: number;
  holderSessionId: string;
}): Promise<boolean> => {
  const drizzle = requireDrizzle(payload);
  const removed = await drizzle.execute(sql`
    DELETE FROM ${LOCKS_TABLE}
    WHERE
      "document_type" = ${documentType}
      AND "document_id" = ${documentId}
      AND "holder_user_id" = ${holderUserId}
      AND "holder_session_id" = ${holderSessionId}
    RETURNING "document_type";
  `);

  return removed.rowCount > 0;
};

export const takeoverEditorDocumentLock = async ({
  payload,
  documentType,
  documentId,
  holderUserId,
  holderSessionId,
  reason,
  leaseSeconds = DEFAULT_LOCK_LEASE_SECONDS,
}: {
  payload: Payload;
  documentType: EditorDocumentType;
  documentId: number;
  holderUserId: number;
  holderSessionId: string;
  reason: string;
  leaseSeconds?: number;
}): Promise<EditorTakeoverResult> => {
  const drizzle = requireDrizzle(payload);
  const lease = clampLeaseSeconds(leaseSeconds);

  const existing = await loadEditorLock({ payload, documentType, documentId });
  if (!existing) {
    return { status: 'not_found' };
  }

  const takeoverReason = reason.trim();
  if (!takeoverReason) {
    return {
      status: 'not_expired',
      lock: existing,
    };
  }

  const updated = await drizzle.execute(sql`
    UPDATE ${LOCKS_TABLE}
    SET
      "holder_user_id" = ${holderUserId},
      "holder_session_id" = ${holderSessionId},
      "acquired_at" = NOW(),
      "last_heartbeat_at" = NOW(),
      "expires_at" = NOW() + make_interval(secs => ${lease}),
      "takeover_reason" = ${takeoverReason}
    WHERE
      "document_type" = ${documentType}
      AND "document_id" = ${documentId}
      AND "expires_at" <= NOW()
    RETURNING
      "document_type",
      "document_id",
      "lock_mode",
      "holder_user_id",
      "holder_session_id",
      "acquired_at",
      "expires_at",
      "last_heartbeat_at",
      "takeover_reason";
  `);

  const lock = toEditorLockRecord(updated.rows[0] as Record<string, unknown> | undefined);
  if (!lock) {
    return {
      status: 'not_expired',
      lock: existing,
    };
  }

  return {
    status: 'taken_over',
    lock,
  };
};

export const loadEditorDocumentLock = loadEditorLock;

export const beginEditorWriteIdempotency = async ({
  payload,
  documentType,
  documentId,
  idempotencyKey,
  requestHash,
}: {
  payload: Payload;
  documentType: EditorDocumentType;
  documentId: number;
  idempotencyKey: string;
  requestHash: string;
}): Promise<EditorIdempotencyBeginResult> => {
  const drizzle = requireDrizzle(payload);

  const inserted = await drizzle.execute(sql`
    INSERT INTO ${IDEMPOTENCY_TABLE} (
      "document_type",
      "document_id",
      "idempotency_key",
      "request_hash",
      "created_at",
      "updated_at"
    )
    VALUES (
      ${documentType},
      ${documentId},
      ${idempotencyKey},
      ${requestHash},
      NOW(),
      NOW()
    )
    ON CONFLICT ("document_type", "document_id", "idempotency_key") DO NOTHING
    RETURNING "id";
  `);

  if (inserted.rowCount > 0) {
    return { status: 'new' };
  }

  const rows = await drizzle.execute(sql`
    SELECT
      "request_hash",
      "response_status",
      "response_body",
      "resulting_revision"
    FROM ${IDEMPOTENCY_TABLE}
    WHERE
      "document_type" = ${documentType}
      AND "document_id" = ${documentId}
      AND "idempotency_key" = ${idempotencyKey}
    LIMIT 1;
  `);

  const row = rows.rows[0] as Record<string, unknown> | undefined;
  if (!row) {
    return { status: 'new' };
  }

  const existingHash = typeof row.request_hash === 'string' ? row.request_hash : null;
  if (!existingHash || existingHash !== requestHash) {
    return {
      status: 'conflict',
      message: 'Idempotency key was reused with a different mutation payload.',
    };
  }

  const responseStatus = parseNumericValue(row.response_status);
  if (responseStatus == null) {
    return { status: 'in_progress' };
  }

  const resultingRevision = parsePositiveInt(row.resulting_revision);
  return {
    status: 'replay',
    responseStatus,
    responseBody: row.response_body ?? null,
    resultingRevision,
  };
};

export const completeEditorWriteIdempotency = async ({
  payload,
  documentType,
  documentId,
  idempotencyKey,
  responseStatus,
  responseBody,
  resultingRevision,
}: {
  payload: Payload;
  documentType: EditorDocumentType;
  documentId: number;
  idempotencyKey: string;
  responseStatus: number;
  responseBody: unknown;
  resultingRevision: number | null;
}): Promise<void> => {
  const drizzle = requireDrizzle(payload);

  await drizzle.execute(sql`
    UPDATE ${IDEMPOTENCY_TABLE}
    SET
      "response_status" = ${responseStatus},
      "response_body" = ${responseBody as any},
      "resulting_revision" = ${resultingRevision},
      "updated_at" = NOW()
    WHERE
      "document_type" = ${documentType}
      AND "document_id" = ${documentId}
      AND "idempotency_key" = ${idempotencyKey};
  `);
};

export const resolveEditorIdempotencyRetentionDays = (value?: unknown): number =>
  clampIdempotencyRetentionDays(
    value ?? process.env.EDITOR_WRITE_IDEMPOTENCY_RETENTION_DAYS,
  );

export const resolveEditorIdempotencyCleanupBatchSize = (value?: unknown): number =>
  clampIdempotencyCleanupBatchSize(
    value ?? process.env.EDITOR_WRITE_IDEMPOTENCY_CLEANUP_BATCH_SIZE,
  );

export const resolveEditorIdempotencyCleanupMaxBatches = (value?: unknown): number =>
  clampIdempotencyCleanupMaxBatches(
    value ?? process.env.EDITOR_WRITE_IDEMPOTENCY_CLEANUP_MAX_BATCHES,
  );

export const cleanupExpiredEditorWriteIdempotency = async ({
  payload,
  retentionDays,
  batchSize,
  maxBatches,
}: {
  payload: Payload;
  retentionDays?: number;
  batchSize?: number;
  maxBatches?: number;
}): Promise<EditorIdempotencyCleanupResult> => {
  const drizzle = requireDrizzle(payload);
  const resolvedRetentionDays = resolveEditorIdempotencyRetentionDays(retentionDays);
  const resolvedBatchSize = resolveEditorIdempotencyCleanupBatchSize(batchSize);
  const resolvedMaxBatches = resolveEditorIdempotencyCleanupMaxBatches(maxBatches);

  let deletedCount = 0;
  let reachedBatchLimit = false;

  for (let batch = 0; batch < resolvedMaxBatches; batch += 1) {
    const deleted = await drizzle.execute(sql`
      WITH "stale" AS (
        SELECT "id"
        FROM ${IDEMPOTENCY_TABLE}
        WHERE "updated_at" < NOW() - make_interval(days => ${resolvedRetentionDays})
        ORDER BY "updated_at" ASC
        LIMIT ${resolvedBatchSize}
      )
      DELETE FROM ${IDEMPOTENCY_TABLE} "target"
      USING "stale"
      WHERE "target"."id" = "stale"."id"
      RETURNING "target"."id";
    `);

    const batchDeleted = deleted.rowCount ?? deleted.rows.length;
    deletedCount += batchDeleted;

    if (batchDeleted < resolvedBatchSize) {
      return {
        retentionDays: resolvedRetentionDays,
        batchSize: resolvedBatchSize,
        maxBatches: resolvedMaxBatches,
        deletedCount,
        reachedBatchLimit,
      };
    }
  }

  reachedBatchLimit = true;
  return {
    retentionDays: resolvedRetentionDays,
    batchSize: resolvedBatchSize,
    maxBatches: resolvedMaxBatches,
    deletedCount,
    reachedBatchLimit,
  };
};
