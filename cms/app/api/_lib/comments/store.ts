import { sql } from '@payloadcms/db-postgres';
import type { Payload } from 'payload';

import { renderCommentMarkdown } from './markdown';
import {
  type CommentRecord,
  type CommentSort,
  type CommentThreadRecord,
} from './types';
import { normaliseId } from '../flightPlanMembers';

const THREAD_FIELDS = sql`
  id,
  resource_type,
  resource_id,
  created_by,
  locked,
  pinned,
  created_at,
  updated_at
`;

const COMMENT_FIELDS = sql`
  c.id,
  c.thread_id,
  c.parent_comment_id,
  c.body_raw,
  c.body_html,
  c.mention_membership_ids,
  c.created_by,
  c.edited_at,
  c.deleted_at,
  c.created_at,
  c.updated_at,
  ctr.score,
  ctr.up_count,
  ctr.down_count,
  ctr.reply_count,
  ctr.last_activity_at
`;

type CommentRow = Record<string, unknown>;

const toThreadRecord = (row: Record<string, unknown> | null | undefined): CommentThreadRecord | null => {
  if (!row) return null;
  const id = normaliseId(row.id);
  const resourceType = typeof row.resource_type === 'string' ? row.resource_type : null;
  const resourceId = normaliseId(row.resource_id);
  if (id == null || !resourceType || resourceId == null) return null;

  return {
    id,
    resourceType,
    resourceId,
    createdById: normaliseId((row as Record<string, unknown>).created_by),
    locked: row.locked === true,
    pinned: row.pinned === true,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  };
};

const toViewerVote = (row: Record<string, unknown>): -1 | 0 | 1 => {
  const value = typeof row.vote_type === 'string' ? row.vote_type : null;
  if (value === 'up') return 1;
  if (value === 'down') return -1;
  return 0;
};

const parseMentionMembershipIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const ids: number[] = [];
  value.forEach((entry) => {
    const id = normaliseId(entry);
    if (id != null && !ids.includes(id)) ids.push(id);
  });
  return ids;
};

const toCommentRecord = (row: CommentRow | null | undefined): CommentRecord | null => {
  if (!row) return null;
  const id = normaliseId(row.id);
  const threadId = normaliseId(row.thread_id);
  if (id == null || threadId == null) return null;

  const parentCommentId = normaliseId(row.parent_comment_id);
  const createdById = normaliseId(row.created_by);

  return {
    id,
    threadId,
    parentCommentId,
    bodyRaw: typeof row.body_raw === 'string' ? row.body_raw : '',
    bodyHtml: typeof row.body_html === 'string' ? row.body_html : '',
    mentionMembershipIds: parseMentionMembershipIds(row.mention_membership_ids),
    createdById,
    editedAt: typeof row.edited_at === 'string' ? row.edited_at : null,
    deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
    score: typeof row.score === 'number' ? row.score : 0,
    upvotes: typeof row.up_count === 'number' ? row.up_count : 0,
    downvotes: typeof row.down_count === 'number' ? row.down_count : 0,
    replyCount: typeof row.reply_count === 'number' ? row.reply_count : 0,
    lastActivityAt: typeof row.last_activity_at === 'string' ? row.last_activity_at : null,
    viewerVote: toViewerVote(row),
  };
};

export const orderClauseForSort = (sort: CommentSort): string => {
  switch (sort) {
    case 'new':
      return 'c.created_at DESC';
    case 'old':
      return 'c.created_at ASC';
    case 'top':
      return 'COALESCE(ctr.score, 0) DESC, c.created_at DESC';
    case 'controversial':
      return 'LEAST(COALESCE(ctr.up_count, 0), COALESCE(ctr.down_count, 0)) DESC,'
        + ' (COALESCE(ctr.up_count, 0) + COALESCE(ctr.down_count, 0)) DESC,'
        + ' c.created_at DESC';
    case 'best':
    default:
      return 'COALESCE(ctr.score, 0) DESC, COALESCE(ctr.last_activity_at, c.created_at) DESC';
  }
};

export const loadThreadById = async (
  payload: Payload,
  threadId: number,
): Promise<CommentThreadRecord | null> => {
  const result = await payload.db.drizzle.execute(sql`
    SELECT ${THREAD_FIELDS}
    FROM "public"."comment_threads"
    WHERE id = ${threadId}
    LIMIT 1;
  `);
  return toThreadRecord(result.rows[0] as Record<string, unknown> | undefined);
};

export const loadThreadByResource = async (
  payload: Payload,
  resourceType: string,
  resourceId: number,
): Promise<CommentThreadRecord | null> => {
  const result = await payload.db.drizzle.execute(sql`
    SELECT ${THREAD_FIELDS}
    FROM "public"."comment_threads"
    WHERE resource_type = ${resourceType} AND resource_id = ${resourceId}
    LIMIT 1;
  `);
  return toThreadRecord(result.rows[0] as Record<string, unknown> | undefined);
};

export const getOrCreateThread = async (
  payload: Payload,
  resourceType: string,
  resourceId: number,
  createdById: number | null,
): Promise<CommentThreadRecord | null> => {
  const result = await payload.db.drizzle.execute(sql`
    INSERT INTO "public"."comment_threads" ("resource_type", "resource_id", "created_by")
    VALUES (${resourceType}, ${resourceId}, ${createdById})
    ON CONFLICT ("resource_type", "resource_id")
    DO UPDATE SET updated_at = "public"."comment_threads".updated_at
    RETURNING ${THREAD_FIELDS};
  `);
  return toThreadRecord(result.rows[0] as Record<string, unknown> | undefined);
};

export const countVisibleComments = async (
  payload: Payload,
  threadId: number,
): Promise<number> => {
  const result = await payload.db.drizzle.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM "public"."comments"
    WHERE thread_id = ${threadId} AND deleted_at IS NULL;
  `);
  const count = (result.rows[0] as { total?: number } | undefined)?.total ?? 0;
  return typeof count === 'number' ? count : 0;
};

export const ensureParentBelongsToThread = async (
  payload: Payload,
  threadId: number,
  parentCommentId: number,
): Promise<boolean> => {
  const result = await payload.db.drizzle.execute(sql`
    SELECT 1
    FROM "public"."comments"
    WHERE id = ${parentCommentId} AND thread_id = ${threadId}
    LIMIT 1;
  `);
  return result.rowCount > 0;
};

export const listCommentsForThread = async ({
  payload,
  threadId,
  sort,
  viewerId,
}: {
  payload: Payload;
  threadId: number;
  sort: CommentSort;
  viewerId: number | null;
}): Promise<CommentRecord[]> => {
  const orderClause = orderClauseForSort(sort);
  const rows = await payload.db.drizzle.execute(sql`
    SELECT ${COMMENT_FIELDS}
    ${viewerId != null ? sql`, votes.vote_type` : sql``}
    FROM "public"."comments" c
    LEFT JOIN "public"."comment_counters" ctr ON ctr.comment_id = c.id
    ${viewerId != null
      ? sql`LEFT JOIN "public"."comment_votes" votes ON votes.comment_id = c.id AND votes.voter_id = ${viewerId}`
      : sql``}
    WHERE c.thread_id = ${threadId}
    ORDER BY ${sql.raw(orderClause)};
  `);

  return rows.rows
    .map((row) => toCommentRecord(row as CommentRow))
    .filter((entry): entry is CommentRecord => Boolean(entry));
};

export const loadCommentWithThread = async (
  payload: Payload,
  commentId: number,
  viewerId: number | null = null,
): Promise<{ comment: CommentRecord | null; thread: CommentThreadRecord | null }> => {
  const rows = await payload.db.drizzle.execute(sql`
    SELECT ${COMMENT_FIELDS}
    ${viewerId != null ? sql`, votes.vote_type` : sql``}
    FROM "public"."comments" c
    LEFT JOIN "public"."comment_counters" ctr ON ctr.comment_id = c.id
    ${viewerId != null
      ? sql`LEFT JOIN "public"."comment_votes" votes ON votes.comment_id = c.id AND votes.voter_id = ${viewerId}`
      : sql``}
    WHERE c.id = ${commentId}
    LIMIT 1;
  `);

  const comment = toCommentRecord(rows.rows[0] as CommentRow | undefined);
  if (!comment) return { comment: null, thread: null };

  const thread = await loadThreadById(payload, comment.threadId);
  return { comment, thread };
};

const insertCounterIfMissing = async (payload: Payload, commentId: number) => {
  await payload.db.drizzle.execute(sql`
    INSERT INTO "public"."comment_counters" ("comment_id", "score", "up_count", "down_count", "reply_count", "last_activity_at")
    VALUES (${commentId}, 0, 0, 0, 0, NOW())
    ON CONFLICT ("comment_id") DO NOTHING;
  `);
};

const touchThreadForComment = async (payload: Payload, commentId: number) => {
  await payload.db.drizzle.execute(sql`
    UPDATE "public"."comment_threads"
    SET updated_at = NOW()
    WHERE id = (SELECT thread_id FROM "public"."comments" WHERE id = ${commentId} LIMIT 1);
  `);
};

export const createComment = async ({
  payload,
  threadId,
  parentCommentId,
  body,
  mentionMembershipIds,
  createdById,
}: {
  payload: Payload;
  threadId: number;
  parentCommentId?: number | null;
  body: string;
  mentionMembershipIds?: number[];
  createdById: number | null;
}): Promise<CommentRecord | null> => {
  const rendered = renderCommentMarkdown(body);
  const parentId = parentCommentId != null ? parentCommentId : null;
  const normalizedMentionIds = Array.from(
    new Set(
      (mentionMembershipIds ?? [])
        .map((entry) => normaliseId(entry))
        .filter((entry): entry is number => entry != null),
    ),
  );

  const result = await payload.db.drizzle.execute(sql`
    INSERT INTO "public"."comments" ("thread_id", "parent_comment_id", "body_raw", "body_html", "mention_membership_ids", "created_by", "created_at", "updated_at")
    VALUES (${threadId}, ${parentId}, ${rendered.raw}, ${rendered.html}, ${JSON.stringify(normalizedMentionIds)}::jsonb, ${createdById}, NOW(), NOW())
    RETURNING ${COMMENT_FIELDS};
  `);

  const comment = toCommentRecord(result.rows[0] as CommentRow | undefined);
  if (!comment) return null;

  await insertCounterIfMissing(payload, comment.id);

  if (parentId != null) {
    await payload.db.drizzle.execute(sql`
      UPDATE "public"."comment_counters"
      SET reply_count = reply_count + 1, last_activity_at = NOW()
      WHERE comment_id = ${parentId};
    `);
  }

  await payload.db.drizzle.execute(sql`
    UPDATE "public"."comment_threads"
    SET updated_at = NOW()
    WHERE id = ${threadId};
  `);

  return comment;
};

export const updateCommentBody = async ({
  payload,
  commentId,
  body,
}: {
  payload: Payload;
  commentId: number;
  body: string;
}): Promise<CommentRecord | null> => {
  const rendered = renderCommentMarkdown(body);
  const result = await payload.db.drizzle.execute(sql`
    UPDATE "public"."comments"
    SET body_raw = ${rendered.raw},
      body_html = ${rendered.html},
      edited_at = NOW(),
      updated_at = NOW()
    WHERE id = ${commentId}
    RETURNING ${COMMENT_FIELDS};
  `);
  await touchThreadForComment(payload, commentId);
  return toCommentRecord(result.rows[0] as CommentRow | undefined);
};

export const markCommentDeleted = async ({
  payload,
  commentId,
  deleted,
}: {
  payload: Payload;
  commentId: number;
  deleted: boolean;
}): Promise<CommentRecord | null> => {
  const result = await payload.db.drizzle.execute(sql`
    UPDATE "public"."comments"
    SET deleted_at = ${deleted ? sql`NOW()` : sql`NULL`},
      updated_at = NOW()
    WHERE id = ${commentId}
    RETURNING ${COMMENT_FIELDS};
  `);
  await touchThreadForComment(payload, commentId);
  return toCommentRecord(result.rows[0] as CommentRow | undefined);
};

export const applyVote = async ({
  payload,
  commentId,
  voterId,
  vote,
}: {
  payload: Payload;
  commentId: number;
  voterId: number;
  vote: -1 | 0 | 1;
}): Promise<CommentRecord | null> => {
  if (vote === 0) {
    await payload.db.drizzle.execute(sql`
      DELETE FROM "public"."comment_votes"
      WHERE comment_id = ${commentId} AND voter_id = ${voterId};
    `);
  } else {
    const voteType = vote > 0 ? 'up' : 'down';
    await payload.db.drizzle.execute(sql`
      INSERT INTO "public"."comment_votes" ("comment_id", "voter_id", "vote_type", "created_at")
      VALUES (${commentId}, ${voterId}, ${voteType}, NOW())
      ON CONFLICT ("comment_id", "voter_id")
      DO UPDATE SET vote_type = ${voteType}, created_at = NOW();
    `);
  }

  const counts = await payload.db.drizzle.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN vote_type = 'up' THEN 1 ELSE 0 END), 0)::int AS up_count,
      COALESCE(SUM(CASE WHEN vote_type = 'down' THEN 1 ELSE 0 END), 0)::int AS down_count
    FROM "public"."comment_votes"
    WHERE comment_id = ${commentId};
  `);

  const row = (counts.rows[0] ?? {}) as { up_count?: number; down_count?: number };
  const upCount = typeof row.up_count === 'number' ? row.up_count : 0;
  const downCount = typeof row.down_count === 'number' ? row.down_count : 0;
  const score = upCount - downCount;

  await payload.db.drizzle.execute(sql`
    INSERT INTO "public"."comment_counters" ("comment_id", "score", "up_count", "down_count", "reply_count", "last_activity_at")
    VALUES (${commentId}, ${score}, ${upCount}, ${downCount}, 0, NOW())
    ON CONFLICT ("comment_id")
    DO UPDATE SET
      score = ${score},
      up_count = ${upCount},
      down_count = ${downCount},
      last_activity_at = NOW();
  `);

  await touchThreadForComment(payload, commentId);

  return (await loadCommentWithThread(payload, commentId, voterId)).comment;
};
