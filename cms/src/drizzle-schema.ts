export * from './payload-generated-schema.ts';

import {
  bigint,
  bigserial,
  boolean,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from '@payloadcms/db-postgres/drizzle/pg-core';

import { users } from './payload-generated-schema.ts';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const elsa_transactions = pgTable(
  'elsa_transactions',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    type: varchar('type', { length: 32 }).notNull(),
    amount: numeric('amount').notNull(),
    delta: numeric('delta').notNull(),
    balanceAfter: numeric('balance_after').notNull(),
    metadata: jsonb('metadata'),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
  },
  (columns) => [
    index('elsa_transactions_user_created_idx').on(columns.userId, columns.createdAt),
    uniqueIndex('elsa_transactions_idempotency_key_idx').on(columns.idempotencyKey),
    foreignKey({
      columns: [columns.userId],
      foreignColumns: [users.id],
      name: 'elsa_transactions_user_id_fk',
    }).onDelete('cascade'),
  ],
);

export const editor_document_revisions = pgTable(
  'editor_document_revisions',
  {
    documentType: varchar('document_type', { length: 32 }).notNull(),
    documentId: integer('document_id').notNull(),
    revision: bigint('revision', { mode: 'number' }).notNull().default(1),
    updatedAt: timestamp('updated_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
  },
  (columns) => [
    index('editor_document_revisions_updated_idx').on(columns.updatedAt),
    uniqueIndex('editor_document_revisions_doc_idx').on(
      columns.documentType,
      columns.documentId,
    ),
  ],
);

export const editor_document_locks = pgTable(
  'editor_document_locks',
  {
    documentType: varchar('document_type', { length: 32 }).notNull(),
    documentId: integer('document_id').notNull(),
    lockMode: varchar('lock_mode', { length: 16 }).notNull().default('soft'),
    holderUserId: integer('holder_user_id').notNull(),
    holderSessionId: varchar('holder_session_id', { length: 128 }).notNull(),
    acquiredAt: timestamp('acquired_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    }).notNull(),
    lastHeartbeatAt: timestamp('last_heartbeat_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    takeoverReason: text('takeover_reason'),
  },
  (columns) => [
    index('editor_document_locks_expires_idx').on(columns.expiresAt),
    uniqueIndex('editor_document_locks_doc_idx').on(
      columns.documentType,
      columns.documentId,
    ),
    foreignKey({
      columns: [columns.holderUserId],
      foreignColumns: [users.id],
      name: 'editor_document_locks_holder_user_fk',
    }).onDelete('cascade'),
  ],
);

export const editor_write_idempotency = pgTable(
  'editor_write_idempotency',
  {
    id: serial('id').primaryKey(),
    documentType: varchar('document_type', { length: 32 }).notNull(),
    documentId: integer('document_id').notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
    requestHash: varchar('request_hash', { length: 128 }).notNull(),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    resultingRevision: bigint('resulting_revision', { mode: 'number' }),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
  },
  (columns) => [
    index('editor_write_idempotency_created_idx').on(columns.createdAt),
    uniqueIndex('editor_write_idempotency_unique_key').on(
      columns.documentType,
      columns.documentId,
      columns.idempotencyKey,
    ),
  ],
);

export const enum_media_references_asset_class = pgEnum(
  'enum_media_references_asset_class',
  ['gallery', 'task', 'avatar', 'badge'],
);

export const enum_media_references_owner_type = pgEnum(
  'enum_media_references_owner_type',
  ['flight-plan', 'page', 'task', 'user'],
);

export const media_references = pgTable(
  'media_references',
  {
    id: serial('id').primaryKey(),
    assetClass: enum_media_references_asset_class('asset_class').notNull(),
    assetId: integer('asset_id').notNull(),
    ownerType: enum_media_references_owner_type('owner_type').notNull(),
    ownerId: integer('owner_id').notNull(),
    fieldPath: varchar('field_path', { length: 128 }).notNull(),
    referenceKey: varchar('reference_key', { length: 128 }).notNull().default(''),
    active: boolean('active').notNull().default(true),
    actorUserId: integer('actor_user_id'),
    requestId: varchar('request_id', { length: 128 }),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
  },
  (columns) => [
    uniqueIndex('media_references_identity_unique').on(
      columns.assetClass,
      columns.assetId,
      columns.ownerType,
      columns.ownerId,
      columns.fieldPath,
      columns.referenceKey,
    ),
    index('media_references_asset_active_idx').on(
      columns.assetClass,
      columns.assetId,
      columns.active,
    ),
    index('media_references_owner_active_idx').on(
      columns.ownerType,
      columns.ownerId,
      columns.active,
    ),
    index('media_references_updated_at_idx').on(columns.updatedAt),
    foreignKey({
      columns: [columns.actorUserId],
      foreignColumns: [users.id],
      name: 'media_references_actor_user_fk',
    }).onDelete('set null'),
  ],
);

export const enum_media_delete_jobs_asset_class = pgEnum(
  'enum_media_delete_jobs_asset_class',
  ['gallery', 'task', 'avatar', 'badge'],
);

export const enum_media_delete_jobs_mode = pgEnum(
  'enum_media_delete_jobs_mode',
  ['safe', 'force'],
);

export const enum_media_delete_jobs_state = pgEnum(
  'enum_media_delete_jobs_state',
  ['queued', 'running', 'succeeded', 'failed', 'dead-letter', 'canceled'],
);

export const media_delete_jobs = pgTable(
  'media_delete_jobs',
  {
    id: serial('id').primaryKey(),
    assetClass: enum_media_delete_jobs_asset_class('asset_class').notNull(),
    assetId: integer('asset_id').notNull(),
    deleteMode: enum_media_delete_jobs_mode('delete_mode').notNull().default('safe'),
    reason: varchar('reason', { length: 128 }).notNull().default('user-request'),
    requestedByUserId: integer('requested_by_user_id'),
    state: enum_media_delete_jobs_state('state').notNull().default('queued'),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    runAfter: timestamp('run_after', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    startedAt: timestamp('started_at', { mode: 'string', withTimezone: true, precision: 3 }),
    finishedAt: timestamp('finished_at', { mode: 'string', withTimezone: true, precision: 3 }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', {
      mode: 'string',
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
  },
  (columns) => [
    index('media_delete_jobs_state_run_after_idx').on(columns.state, columns.runAfter),
    index('media_delete_jobs_asset_created_idx').on(
      columns.assetClass,
      columns.assetId,
      columns.createdAt,
    ),
    foreignKey({
      columns: [columns.requestedByUserId],
      foreignColumns: [users.id],
      name: 'media_delete_jobs_requested_by_user_fk',
    }).onDelete('set null'),
  ],
);

export const message_encryption_keys = pgTable(
  'message_encryption_keys',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id').notNull(),
    publicKey: bytea('public_key').notNull(),
    sealedPrivateKey: bytea('sealed_private_key').notNull(),
    version: integer('version').notNull().default(1),
    rotatedAt: timestamp('rotated_at', { mode: 'string', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).defaultNow().notNull(),
  },
  (columns) => [
    uniqueIndex('message_encryption_keys_user_unique').on(columns.userId),
    index('message_encryption_keys_user_idx').on(columns.userId),
    foreignKey({
      columns: [columns.userId],
      foreignColumns: [users.id],
      name: 'message_encryption_keys_user_id_fk',
    }).onDelete('cascade'),
  ],
);

export const message_threads = pgTable(
  'message_threads',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    slug: varchar('slug', { length: 160 }).notNull(),
    participantAId: integer('participant_a_id').notNull(),
    participantBId: integer('participant_b_id').notNull(),
    encryptedThreadKey: bytea('encrypted_thread_key').notNull(),
    threadKeyNonce: bytea('thread_key_nonce').notNull(),
    threadKeyTag: bytea('thread_key_tag').notNull(),
    threadKeyVersion: integer('thread_key_version').notNull().default(1),
    lastMessageAt: timestamp('last_message_at', { mode: 'string', withTimezone: true }),
    lastSenderId: integer('last_sender_id'),
    unreadA: integer('unread_a').notNull().default(0),
    unreadB: integer('unread_b').notNull().default(0),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).defaultNow().notNull(),
  },
  (columns) => [
    uniqueIndex('message_threads_slug_unique').on(columns.slug),
    index('message_threads_last_message_idx').on(columns.lastMessageAt),
    foreignKey({
      columns: [columns.participantAId],
      foreignColumns: [users.id],
      name: 'message_threads_participant_a_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [columns.participantBId],
      foreignColumns: [users.id],
      name: 'message_threads_participant_b_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [columns.lastSenderId],
      foreignColumns: [users.id],
      name: 'message_threads_last_sender_fk',
    }).onDelete('set null'),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    threadId: bigint('thread_id', { mode: 'number' }).notNull(),
    senderId: integer('sender_id').notNull(),
    recipientId: integer('recipient_id').notNull(),
    bodyCiphertext: bytea('body_ciphertext').notNull(),
    bodyNonce: bytea('body_nonce').notNull(),
    bodyAuthTag: bytea('body_auth_tag').notNull(),
    bodyPreview: varchar('body_preview', { length: 240 }),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow().notNull(),
    readAt: timestamp('read_at', { mode: 'string', withTimezone: true }),
  },
  (columns) => [
    index('messages_thread_idx').on(columns.threadId, columns.createdAt),
    index('messages_recipient_unread_idx').on(columns.recipientId, columns.readAt),
    foreignKey({
      columns: [columns.threadId],
      foreignColumns: [message_threads.id],
      name: 'messages_thread_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [columns.senderId],
      foreignColumns: [users.id],
      name: 'messages_sender_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [columns.recipientId],
      foreignColumns: [users.id],
      name: 'messages_recipient_fk',
    }).onDelete('cascade'),
  ],
);

export const enum_comment_votes_vote_type = pgEnum('enum_comment_votes_vote_type', ['up', 'down']);

export const comment_threads = pgTable(
  'comment_threads',
  {
    id: serial('id').primaryKey(),
    resourceType: varchar('resource_type').notNull(),
    resourceId: integer('resource_id').notNull(),
    createdBy: integer('created_by'),
    locked: boolean('locked').notNull().default(false),
    pinned: boolean('pinned').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).defaultNow().notNull(),
  },
  (columns) => [
    uniqueIndex('comment_threads_resource_idx').on(columns.resourceType, columns.resourceId),
    index('comment_threads_resource_lookup_idx').on(columns.resourceType, columns.resourceId, columns.locked),
    foreignKey({
      columns: [columns.createdBy],
      foreignColumns: [users.id],
      name: 'comment_threads_created_by_fk',
    }).onDelete('set null'),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    threadId: integer('thread_id').notNull(),
    parentCommentId: integer('parent_comment_id'),
    bodyRaw: text('body_raw').notNull(),
    bodyHtml: text('body_html').notNull(),
    createdBy: integer('created_by'),
    editedAt: timestamp('edited_at', { mode: 'string', withTimezone: true }),
    deletedAt: timestamp('deleted_at', { mode: 'string', withTimezone: true }),
    isInternal: boolean('is_internal').notNull().default(false),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: true }).defaultNow().notNull(),
  },
  (columns) => [
    index('comments_thread_parent_idx').on(columns.threadId, columns.parentCommentId, columns.createdAt),
    index('comments_author_idx').on(columns.createdBy),
    foreignKey({
      columns: [columns.threadId],
      foreignColumns: [comment_threads.id],
      name: 'comments_thread_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [columns.parentCommentId],
      foreignColumns: [columns.id],
      name: 'comments_parent_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [columns.createdBy],
      foreignColumns: [users.id],
      name: 'comments_created_by_fk',
    }).onDelete('set null'),
  ],
);

export const comment_counters = pgTable(
  'comment_counters',
  {
    commentId: integer('comment_id').primaryKey(),
    score: integer('score').notNull().default(0),
    upCount: integer('up_count').notNull().default(0),
    downCount: integer('down_count').notNull().default(0),
    replyCount: integer('reply_count').notNull().default(0),
    lastActivityAt: timestamp('last_activity_at', { mode: 'string', withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (columns) => [
    index('comment_counters_score_idx').on(columns.score, columns.lastActivityAt),
    foreignKey({
      columns: [columns.commentId],
      foreignColumns: [comments.id],
      name: 'comment_counters_comment_fk',
    }).onDelete('cascade'),
  ],
);

export const comment_votes = pgTable(
  'comment_votes',
  {
    id: serial('id').primaryKey(),
    commentId: integer('comment_id').notNull(),
    voterId: integer('voter_id').notNull(),
    voteType: enum_comment_votes_vote_type('vote_type').notNull(),
    createdAt: timestamp('created_at', { mode: 'string', withTimezone: true }).defaultNow().notNull(),
  },
  (columns) => [
    uniqueIndex('comment_votes_unique_vote').on(columns.commentId, columns.voterId),
    index('comment_votes_voter_idx').on(columns.voterId),
    foreignKey({
      columns: [columns.commentId],
      foreignColumns: [comments.id],
      name: 'comment_votes_comment_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [columns.voterId],
      foreignColumns: [users.id],
      name: 'comment_votes_voter_fk',
    }).onDelete('cascade'),
  ],
);
