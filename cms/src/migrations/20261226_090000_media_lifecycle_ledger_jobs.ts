import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const USERS_TABLE = sql.raw('"public"."users"');
const GALLERY_IMAGES_TABLE = sql.raw('"public"."gallery_images"');
const TASK_ATTACHMENTS_TABLE = sql.raw('"public"."task_attachments"');
const AVATARS_TABLE = sql.raw('"public"."avatars"');
const MEDIA_REFERENCES_TABLE = sql.raw('"public"."media_references"');
const MEDIA_DELETE_JOBS_TABLE = sql.raw('"public"."media_delete_jobs"');

const setMigrationTimeouts = sql.raw(`
  SET lock_timeout = '15s';
  SET statement_timeout = '5min';
`);

const resetMigrationTimeouts = sql.raw(`
  RESET statement_timeout;
  RESET lock_timeout;
`);

const addLifecycleColumns = async (
  db: MigrateUpArgs['db'],
  table: ReturnType<typeof sql.raw>,
): Promise<void> => {
  await db.execute(sql`
    ALTER TABLE ${table}
    ADD COLUMN IF NOT EXISTS "lifecycle_state" varchar(16) NOT NULL DEFAULT 'active';
  `);
  await db.execute(sql`
    ALTER TABLE ${table}
    ADD COLUMN IF NOT EXISTS "delete_reason" varchar(128);
  `);
  await db.execute(sql`
    ALTER TABLE ${table}
    ADD COLUMN IF NOT EXISTS "pending_delete_at" timestamptz;
  `);
  await db.execute(sql`
    ALTER TABLE ${table}
    ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
  `);
  await db.execute(sql`
    ALTER TABLE ${table}
    ADD COLUMN IF NOT EXISTS "lifecycle_updated_at" timestamptz NOT NULL DEFAULT NOW();
  `);
};

const addLifecycleConstraints = async (
  db: MigrateUpArgs['db'],
  table: ReturnType<typeof sql.raw>,
  constraintName: string,
): Promise<void> => {
  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${table}
      ADD CONSTRAINT ${sql.identifier(constraintName)}
      CHECK ("lifecycle_state" IN ('active', 'pending-delete', 'deleted'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
};

const dropLifecycleColumns = async (
  db: MigrateDownArgs['db'],
  table: ReturnType<typeof sql.raw>,
  constraintName: string,
): Promise<void> => {
  await db.execute(sql`
    ALTER TABLE ${table}
    DROP CONSTRAINT IF EXISTS ${sql.identifier(constraintName)};
  `);
  await db.execute(sql`
    ALTER TABLE ${table}
    DROP COLUMN IF EXISTS "lifecycle_updated_at";
  `);
  await db.execute(sql`
    ALTER TABLE ${table}
    DROP COLUMN IF EXISTS "deleted_at";
  `);
  await db.execute(sql`
    ALTER TABLE ${table}
    DROP COLUMN IF EXISTS "pending_delete_at";
  `);
  await db.execute(sql`
    ALTER TABLE ${table}
    DROP COLUMN IF EXISTS "delete_reason";
  `);
  await db.execute(sql`
    ALTER TABLE ${table}
    DROP COLUMN IF EXISTS "lifecycle_state";
  `);
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(setMigrationTimeouts);

  await addLifecycleColumns(db, GALLERY_IMAGES_TABLE);
  await addLifecycleColumns(db, TASK_ATTACHMENTS_TABLE);
  await addLifecycleColumns(db, AVATARS_TABLE);

  await addLifecycleConstraints(
    db,
    GALLERY_IMAGES_TABLE,
    'gallery_images_lifecycle_state_ck',
  );
  await addLifecycleConstraints(
    db,
    TASK_ATTACHMENTS_TABLE,
    'task_attachments_lifecycle_state_ck',
  );
  await addLifecycleConstraints(db, AVATARS_TABLE, 'avatars_lifecycle_state_ck');

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "gallery_images_lifecycle_state_idx"
      ON ${GALLERY_IMAGES_TABLE} USING btree ("lifecycle_state", "pending_delete_at");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "task_attachments_lifecycle_state_idx"
      ON ${TASK_ATTACHMENTS_TABLE} USING btree ("lifecycle_state", "pending_delete_at");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "avatars_lifecycle_state_idx"
      ON ${AVATARS_TABLE} USING btree ("lifecycle_state", "pending_delete_at");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${MEDIA_REFERENCES_TABLE} (
      "id" serial PRIMARY KEY,
      "asset_class" varchar(16) NOT NULL,
      "asset_id" integer NOT NULL,
      "owner_type" varchar(32) NOT NULL,
      "owner_id" integer NOT NULL,
      "field_path" varchar(128) NOT NULL,
      "reference_key" varchar(128) NOT NULL DEFAULT '',
      "active" boolean NOT NULL DEFAULT true,
      "actor_user_id" integer REFERENCES ${USERS_TABLE}("id") ON DELETE SET NULL,
      "request_id" varchar(128),
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "media_references_asset_class_ck"
        CHECK ("asset_class" IN ('gallery', 'task', 'avatar')),
      CONSTRAINT "media_references_owner_type_ck"
        CHECK ("owner_type" IN ('flight-plan', 'page', 'task', 'user'))
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "media_references_identity_unique"
      ON ${MEDIA_REFERENCES_TABLE} USING btree
      ("asset_class", "asset_id", "owner_type", "owner_id", "field_path", "reference_key");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "media_references_asset_active_idx"
      ON ${MEDIA_REFERENCES_TABLE} USING btree ("asset_class", "asset_id", "active");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "media_references_owner_active_idx"
      ON ${MEDIA_REFERENCES_TABLE} USING btree ("owner_type", "owner_id", "active");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "media_references_updated_at_idx"
      ON ${MEDIA_REFERENCES_TABLE} USING btree ("updated_at");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${MEDIA_DELETE_JOBS_TABLE} (
      "id" serial PRIMARY KEY,
      "asset_class" varchar(16) NOT NULL,
      "asset_id" integer NOT NULL,
      "delete_mode" varchar(16) NOT NULL DEFAULT 'safe',
      "reason" varchar(128) NOT NULL DEFAULT 'user-request',
      "requested_by_user_id" integer REFERENCES ${USERS_TABLE}("id") ON DELETE SET NULL,
      "state" varchar(16) NOT NULL DEFAULT 'queued',
      "attempt_count" integer NOT NULL DEFAULT 0,
      "max_attempts" integer NOT NULL DEFAULT 5,
      "run_after" timestamptz NOT NULL DEFAULT NOW(),
      "started_at" timestamptz,
      "finished_at" timestamptz,
      "last_error" text,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "media_delete_jobs_asset_class_ck"
        CHECK ("asset_class" IN ('gallery', 'task', 'avatar')),
      CONSTRAINT "media_delete_jobs_mode_ck"
        CHECK ("delete_mode" IN ('safe', 'force')),
      CONSTRAINT "media_delete_jobs_state_ck"
        CHECK ("state" IN ('queued', 'running', 'succeeded', 'failed', 'dead-letter', 'canceled')),
      CONSTRAINT "media_delete_jobs_attempts_ck"
        CHECK ("attempt_count" >= 0 AND "max_attempts" >= 1)
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "media_delete_jobs_asset_open_unique"
      ON ${MEDIA_DELETE_JOBS_TABLE} USING btree ("asset_class", "asset_id")
      WHERE "state" IN ('queued', 'running');
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "media_delete_jobs_state_run_after_idx"
      ON ${MEDIA_DELETE_JOBS_TABLE} USING btree ("state", "run_after");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "media_delete_jobs_asset_created_idx"
      ON ${MEDIA_DELETE_JOBS_TABLE} USING btree ("asset_class", "asset_id", "created_at" DESC);
  `);

  await db.execute(resetMigrationTimeouts);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(setMigrationTimeouts);

  await db.execute(sql`
    DROP TABLE IF EXISTS ${MEDIA_DELETE_JOBS_TABLE} CASCADE;
  `);
  await db.execute(sql`
    DROP TABLE IF EXISTS ${MEDIA_REFERENCES_TABLE} CASCADE;
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "avatars_lifecycle_state_idx";
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS "task_attachments_lifecycle_state_idx";
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS "gallery_images_lifecycle_state_idx";
  `);

  await dropLifecycleColumns(db, AVATARS_TABLE, 'avatars_lifecycle_state_ck');
  await dropLifecycleColumns(
    db,
    TASK_ATTACHMENTS_TABLE,
    'task_attachments_lifecycle_state_ck',
  );
  await dropLifecycleColumns(
    db,
    GALLERY_IMAGES_TABLE,
    'gallery_images_lifecycle_state_ck',
  );

  await db.execute(resetMigrationTimeouts);
}
