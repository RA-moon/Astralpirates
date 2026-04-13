import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const HONOR_BADGE_MEDIA_TABLE = sql.raw('"public"."honor_badge_media"');
const USERS_TABLE = sql.raw('"public"."users"');
const LOCKED_RELS_TABLE = sql.raw('"public"."payload_locked_documents_rels"');
const HONOR_BADGE_ENUM = sql.raw('"public"."enum_honor_badge_media_badge_code"');
const LOCKED_COLUMN = '"honor_badge_media_id"';
const LOCKED_INDEX = sql.identifier('payload_locked_documents_rels_honor_badge_media_id_idx');
const LOCKED_FK = sql.identifier('payload_locked_documents_rels_honor_badge_media_fk');

const setMigrationTimeouts = sql.raw(`
  SET lock_timeout = '15s';
  SET statement_timeout = '5min';
`);

const resetMigrationTimeouts = sql.raw(`
  RESET statement_timeout;
  RESET lock_timeout;
`);

const ensureBadgeCodeEnum = async (db: MigrateUpArgs['db']): Promise<void> => {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_honor_badge_media_badge_code'
          AND n.nspname = 'public'
      ) THEN
        CREATE TYPE ${HONOR_BADGE_ENUM} AS ENUM ('pioneer');
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_honor_badge_media_badge_code'
          AND n.nspname = 'public'
      ) THEN
        ALTER TYPE ${HONOR_BADGE_ENUM} ADD VALUE IF NOT EXISTS 'pioneer';
      END IF;
    END
    $$;
  `);
};

const createHonorBadgeMediaTableIfMissing = async (db: MigrateUpArgs['db']): Promise<void> => {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${HONOR_BADGE_MEDIA_TABLE} (
      "id" serial PRIMARY KEY,
      "badge_code" ${HONOR_BADGE_ENUM} NOT NULL,
      "alt" varchar,
      "uploaded_by_id" integer NOT NULL,
      "updated_at" timestamptz(3) DEFAULT now() NOT NULL,
      "created_at" timestamptz(3) DEFAULT now() NOT NULL,
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
      "lifecycle_state" varchar(16) NOT NULL DEFAULT 'active',
      "delete_reason" varchar(128),
      "pending_delete_at" timestamptz,
      "deleted_at" timestamptz,
      "lifecycle_updated_at" timestamptz NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
    ADD COLUMN IF NOT EXISTS "lifecycle_state" varchar(16) NOT NULL DEFAULT 'active';
  `);
  await db.execute(sql`
    ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
    ADD COLUMN IF NOT EXISTS "delete_reason" varchar(128);
  `);
  await db.execute(sql`
    ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
    ADD COLUMN IF NOT EXISTS "pending_delete_at" timestamptz;
  `);
  await db.execute(sql`
    ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
    ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
  `);
  await db.execute(sql`
    ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
    ADD COLUMN IF NOT EXISTS "lifecycle_updated_at" timestamptz NOT NULL DEFAULT NOW();
  `);
};

const ensureHonorBadgeMediaIndexesAndConstraints = async (db: MigrateUpArgs['db']): Promise<void> => {
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "honor_badge_media_badge_code_idx"
    ON ${HONOR_BADGE_MEDIA_TABLE} ("badge_code");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "honor_badge_media_uploaded_by_idx"
    ON ${HONOR_BADGE_MEDIA_TABLE} ("uploaded_by_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "honor_badge_media_updated_at_idx"
    ON ${HONOR_BADGE_MEDIA_TABLE} ("updated_at");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "honor_badge_media_created_at_idx"
    ON ${HONOR_BADGE_MEDIA_TABLE} ("created_at");
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "honor_badge_media_filename_idx"
    ON ${HONOR_BADGE_MEDIA_TABLE} ("filename");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "honor_badge_media_sizes_thumbnail_sizes_thumbnail_filena_idx"
    ON ${HONOR_BADGE_MEDIA_TABLE} ("sizes_thumbnail_filename");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "honor_badge_media_lifecycle_state_idx"
    ON ${HONOR_BADGE_MEDIA_TABLE} ("lifecycle_state", "pending_delete_at");
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
      ADD CONSTRAINT "honor_badge_media_uploaded_by_fk"
      FOREIGN KEY ("uploaded_by_id") REFERENCES ${USERS_TABLE}("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
      ADD CONSTRAINT "honor_badge_media_lifecycle_state_ck"
      CHECK ("lifecycle_state" IN ('active', 'pending-delete', 'deleted'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
};

const ensureLockedDocumentRelWiring = async (db: MigrateUpArgs['db']): Promise<void> => {
  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
    ADD COLUMN IF NOT EXISTS ${sql.raw(LOCKED_COLUMN)} integer;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${LOCKED_INDEX}
    ON ${LOCKED_RELS_TABLE} (${sql.raw(LOCKED_COLUMN)});
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${LOCKED_RELS_TABLE}
      ADD CONSTRAINT ${LOCKED_FK}
      FOREIGN KEY (${sql.raw(LOCKED_COLUMN)}) REFERENCES ${HONOR_BADGE_MEDIA_TABLE}("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(setMigrationTimeouts);
  await ensureBadgeCodeEnum(db);
  await createHonorBadgeMediaTableIfMissing(db);
  await ensureHonorBadgeMediaIndexesAndConstraints(db);
  await ensureLockedDocumentRelWiring(db);
  await db.execute(resetMigrationTimeouts);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Compatibility migration: intentionally non-destructive.
  void db;
}
