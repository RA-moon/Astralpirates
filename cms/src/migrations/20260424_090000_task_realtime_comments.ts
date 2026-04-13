import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TASKS_TABLE = sql.raw('"flight_plan_tasks"');
const FLIGHT_PLANS_TABLE = sql.raw('"flight_plans"');
const MEMBERS_TABLE = sql.raw('"flight_plan_memberships"');
const USERS_TABLE = sql.raw('"users"');

const COMMENTS_TABLE = sql.raw('"flight_plan_task_comments"');
const ATTACHMENTS_TABLE = sql.raw('"task_attachments"');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${TASKS_TABLE}
    ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "is_crew_only" boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "attachments" jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS "links" jsonb NOT NULL DEFAULT '[]'::jsonb;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${COMMENTS_TABLE} (
      "id" serial PRIMARY KEY,
      "task_id" integer NOT NULL REFERENCES ${TASKS_TABLE}("id") ON DELETE CASCADE,
      "flight_plan_id" integer NOT NULL REFERENCES ${FLIGHT_PLANS_TABLE}("id") ON DELETE CASCADE,
      "author_membership_id" integer REFERENCES ${MEMBERS_TABLE}("id") ON DELETE SET NULL,
      "body" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "mentions" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "version" integer NOT NULL DEFAULT 1,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      "deleted_at" timestamptz
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_task_comments_task_idx"
    ON ${COMMENTS_TABLE} ("task_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_task_comments_plan_idx"
    ON ${COMMENTS_TABLE} ("flight_plan_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_task_comments_author_idx"
    ON ${COMMENTS_TABLE} ("author_membership_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_task_comments_created_at_idx"
    ON ${COMMENTS_TABLE} ("created_at");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${ATTACHMENTS_TABLE} (
      "id" serial PRIMARY KEY,
      "flight_plan_id" integer NOT NULL REFERENCES ${FLIGHT_PLANS_TABLE}("id") ON DELETE CASCADE,
      "task_id" integer NOT NULL REFERENCES ${TASKS_TABLE}("id") ON DELETE CASCADE,
      "uploaded_by_id" integer NOT NULL REFERENCES ${USERS_TABLE}("id") ON DELETE SET NULL,
      "url" varchar,
      "thumbnail_u_r_l" varchar,
      "filename" varchar,
      "mime_type" varchar,
      "filesize" numeric,
      "width" numeric,
      "height" numeric,
      "focal_x" numeric,
      "focal_y" numeric,
      "sizes_thumbnail_url" varchar,
      "sizes_thumbnail_width" numeric,
      "sizes_thumbnail_height" numeric,
      "sizes_thumbnail_mime_type" varchar,
      "sizes_thumbnail_filesize" numeric,
      "sizes_thumbnail_filename" varchar,
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      "created_at" timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "task_attachments_plan_idx"
    ON ${ATTACHMENTS_TABLE} ("flight_plan_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "task_attachments_task_idx"
    ON ${ATTACHMENTS_TABLE} ("task_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "task_attachments_uploaded_by_idx"
    ON ${ATTACHMENTS_TABLE} ("uploaded_by_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "task_attachments_created_at_idx"
    ON ${ATTACHMENTS_TABLE} ("created_at");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "task_attachments_filename_idx"
    ON ${ATTACHMENTS_TABLE} ("filename");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS ${ATTACHMENTS_TABLE};
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS ${COMMENTS_TABLE};
  `);

  await db.execute(sql`
    ALTER TABLE ${TASKS_TABLE}
    DROP COLUMN IF EXISTS "version",
    DROP COLUMN IF EXISTS "is_crew_only",
    DROP COLUMN IF EXISTS "attachments",
    DROP COLUMN IF EXISTS "links";
  `);
}
