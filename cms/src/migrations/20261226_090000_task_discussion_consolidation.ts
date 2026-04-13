import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

type LegacyCommentRow = {
  id: number;
  task_id: number;
  author_membership_id: number | null;
  user_id: number | null;
  body: unknown;
  mentions: unknown;
  created_at: string | Date;
  updated_at: string | Date;
  deleted_at: string | Date | null;
};

type ThreadRow = {
  id: number;
  resource_id: number;
};

const toNullableNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const toIsoString = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return new Date().toISOString();
};

const toNullableIsoString = (value: unknown): string | null => {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim().length > 0) return value;
  return null;
};

const parseMentionMembershipIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const ids = new Set<number>();
  value.forEach((entry) => {
    const id = toNullableNumber(entry);
    if (id != null) ids.add(id);
  });
  return Array.from(ids).sort((a, b) => a - b);
};

const collectText = (value: unknown, acc: string[]) => {
  if (value == null) return;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length) acc.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectText(entry, acc));
    return;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string' && record.text.trim().length > 0) {
      acc.push(record.text.trim());
    }
    if (Array.isArray(record.children)) {
      record.children.forEach((entry) => collectText(entry, acc));
    }
  }
};

const lexicalToPlainText = (value: unknown): string => {
  const parts: string[] = [];
  collectText(value, parts);
  const text = parts.join(' ').replace(/\s+/g, ' ').trim();
  return text.length ? text : '[Legacy task comment]';
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const toLegacyCommentRows = (rows: unknown[]): LegacyCommentRow[] =>
  rows
    .map((row) => row as Partial<LegacyCommentRow>)
    .map((row) => ({
      id: toNullableNumber(row.id) ?? 0,
      task_id: toNullableNumber(row.task_id) ?? 0,
      author_membership_id: toNullableNumber(row.author_membership_id),
      user_id: toNullableNumber(row.user_id),
      body: row.body ?? null,
      mentions: row.mentions ?? [],
      created_at: row.created_at ?? new Date().toISOString(),
      updated_at: row.updated_at ?? new Date().toISOString(),
      deleted_at: (row.deleted_at ?? null) as string | Date | null,
    }))
    .filter((row) => row.id > 0 && row.task_id > 0);

const toThreadRows = (rows: unknown[]): ThreadRow[] =>
  rows
    .map((row) => row as Partial<ThreadRow>)
    .map((row) => ({
      id: toNullableNumber(row.id) ?? 0,
      resource_id: toNullableNumber(row.resource_id) ?? 0,
    }))
    .filter((row) => row.id > 0 && row.resource_id > 0);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "public"."comments"
    ADD COLUMN IF NOT EXISTS "mention_membership_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);

  const legacyTableCheck = await db.execute(sql`
    SELECT to_regclass('public.flight_plan_task_comments') AS table_name;
  `);
  const tableName = (legacyTableCheck.rows?.[0] as { table_name?: unknown } | undefined)?.table_name;
  if (!tableName) {
    return;
  }

  await db.execute(sql`
    INSERT INTO "public"."comment_threads" ("resource_type", "resource_id", "created_by", "created_at", "updated_at")
    SELECT
      'flight-plan-task',
      legacy.task_id,
      NULL,
      MIN(legacy.created_at),
      MAX(legacy.updated_at)
    FROM "public"."flight_plan_task_comments" legacy
    LEFT JOIN "public"."comment_threads" existing
      ON existing.resource_type = 'flight-plan-task'
      AND existing.resource_id = legacy.task_id
    WHERE existing.id IS NULL
    GROUP BY legacy.task_id;
  `);

  const legacyRowsResult = await db.execute(sql`
    SELECT
      legacy.id,
      legacy.task_id,
      legacy.author_membership_id,
      membership.user_id,
      legacy.body,
      legacy.mentions,
      legacy.created_at,
      legacy.updated_at,
      legacy.deleted_at
    FROM "public"."flight_plan_task_comments" legacy
    LEFT JOIN "public"."flight_plan_memberships" membership
      ON membership.id = legacy.author_membership_id
    ORDER BY legacy.id ASC;
  `);
  const legacyRows = toLegacyCommentRows(legacyRowsResult.rows);
  if (!legacyRows.length) {
    return;
  }

  const threadRowsResult = await db.execute(sql`
    SELECT id, resource_id
    FROM "public"."comment_threads"
    WHERE resource_type = 'flight-plan-task';
  `);
  const threadRows = toThreadRows(threadRowsResult.rows);
  const threadIdByTask = new Map<number, number>();
  threadRows.forEach((row) => {
    threadIdByTask.set(row.resource_id, row.id);
  });

  for (const legacy of legacyRows) {
    const threadId = threadIdByTask.get(legacy.task_id);
    if (!threadId) continue;

    const bodyRaw = lexicalToPlainText(legacy.body);
    const bodyHtml = `<p>${escapeHtml(bodyRaw)}</p>`;
    const mentionMembershipIds = parseMentionMembershipIds(legacy.mentions);
    const createdAt = toIsoString(legacy.created_at);
    const updatedAt = toIsoString(legacy.updated_at);
    const deletedAt = toNullableIsoString(legacy.deleted_at);
    const createdBy = legacy.user_id;

    const inserted = await db.execute(sql`
      INSERT INTO "public"."comments" (
        "thread_id",
        "parent_comment_id",
        "body_raw",
        "body_html",
        "mention_membership_ids",
        "created_by",
        "edited_at",
        "deleted_at",
        "created_at",
        "updated_at"
      )
      VALUES (
        ${threadId},
        NULL,
        ${bodyRaw},
        ${bodyHtml},
        ${JSON.stringify(mentionMembershipIds)}::jsonb,
        ${createdBy},
        NULL,
        ${deletedAt},
        ${createdAt},
        ${updatedAt}
      )
      RETURNING "id";
    `);
    const commentId = toNullableNumber((inserted.rows?.[0] as { id?: unknown } | undefined)?.id);
    if (commentId == null) continue;

    await db.execute(sql`
      INSERT INTO "public"."comment_counters" (
        "comment_id",
        "score",
        "up_count",
        "down_count",
        "reply_count",
        "last_activity_at"
      )
      VALUES (${commentId}, 0, 0, 0, 0, ${updatedAt})
      ON CONFLICT ("comment_id") DO NOTHING;
    `);
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "public"."comments"
    DROP COLUMN IF EXISTS "mention_membership_ids";
  `);
}
