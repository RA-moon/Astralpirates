import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const HONOR_BADGE_MEDIA_TABLE = sql.raw('"public"."honor_badge_media"');
const MEDIA_REFERENCES_TABLE = sql.raw('"public"."media_references"');
const MEDIA_DELETE_JOBS_TABLE = sql.raw('"public"."media_delete_jobs"');
const HONOR_BADGE_MEDIA_REGCLASS = 'public.honor_badge_media';

const setMigrationTimeouts = sql.raw(`
  SET lock_timeout = '15s';
  SET statement_timeout = '5min';
`);

const resetMigrationTimeouts = sql.raw(`
  RESET statement_timeout;
  RESET lock_timeout;
`);

type MigrationDb = MigrateUpArgs['db'] | MigrateDownArgs['db'];

const tableExists = async (db: MigrationDb, regclass: string): Promise<boolean> => {
  const result = await db.execute(sql`SELECT to_regclass(${regclass}) AS table_name;`);
  const tableName = (result.rows?.[0] as { table_name?: unknown } | undefined)?.table_name;
  return typeof tableName === 'string' && tableName.length > 0;
};

const addLifecycleColumns = async (db: MigrateUpArgs['db']): Promise<void> => {
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

const addLifecycleConstraint = async (db: MigrateUpArgs['db']): Promise<void> => {
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

const updateAssetClassConstraintsForBadges = async (db: MigrateUpArgs['db']): Promise<void> => {
  await db.execute(sql`
    ALTER TABLE ${MEDIA_REFERENCES_TABLE}
    DROP CONSTRAINT IF EXISTS "media_references_asset_class_ck";
  `);
  await db.execute(sql`
    ALTER TABLE ${MEDIA_REFERENCES_TABLE}
    ADD CONSTRAINT "media_references_asset_class_ck"
    CHECK ("asset_class" IN ('gallery', 'task', 'avatar', 'badge'));
  `);

  await db.execute(sql`
    ALTER TABLE ${MEDIA_DELETE_JOBS_TABLE}
    DROP CONSTRAINT IF EXISTS "media_delete_jobs_asset_class_ck";
  `);
  await db.execute(sql`
    ALTER TABLE ${MEDIA_DELETE_JOBS_TABLE}
    ADD CONSTRAINT "media_delete_jobs_asset_class_ck"
    CHECK ("asset_class" IN ('gallery', 'task', 'avatar', 'badge'));
  `);
};

const revertAssetClassConstraints = async (db: MigrateDownArgs['db']): Promise<void> => {
  await db.execute(sql`
    ALTER TABLE ${MEDIA_REFERENCES_TABLE}
    DROP CONSTRAINT IF EXISTS "media_references_asset_class_ck";
  `);
  await db.execute(sql`
    ALTER TABLE ${MEDIA_REFERENCES_TABLE}
    ADD CONSTRAINT "media_references_asset_class_ck"
    CHECK ("asset_class" IN ('gallery', 'task', 'avatar'));
  `);

  await db.execute(sql`
    ALTER TABLE ${MEDIA_DELETE_JOBS_TABLE}
    DROP CONSTRAINT IF EXISTS "media_delete_jobs_asset_class_ck";
  `);
  await db.execute(sql`
    ALTER TABLE ${MEDIA_DELETE_JOBS_TABLE}
    ADD CONSTRAINT "media_delete_jobs_asset_class_ck"
    CHECK ("asset_class" IN ('gallery', 'task', 'avatar'));
  `);
};

const dropLifecycleColumns = async (db: MigrateDownArgs['db']): Promise<void> => {
  await db.execute(sql`
    ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
    DROP CONSTRAINT IF EXISTS "honor_badge_media_lifecycle_state_ck";
  `);
  await db.execute(sql`
    ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
    DROP COLUMN IF EXISTS "lifecycle_updated_at";
  `);
  await db.execute(sql`
    ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
    DROP COLUMN IF EXISTS "deleted_at";
  `);
  await db.execute(sql`
    ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
    DROP COLUMN IF EXISTS "pending_delete_at";
  `);
  await db.execute(sql`
    ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
    DROP COLUMN IF EXISTS "delete_reason";
  `);
  await db.execute(sql`
    ALTER TABLE ${HONOR_BADGE_MEDIA_TABLE}
    DROP COLUMN IF EXISTS "lifecycle_state";
  `);
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(setMigrationTimeouts);

  if (await tableExists(db, HONOR_BADGE_MEDIA_REGCLASS)) {
    await addLifecycleColumns(db);
    await addLifecycleConstraint(db);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "honor_badge_media_lifecycle_state_idx"
        ON ${HONOR_BADGE_MEDIA_TABLE} USING btree ("lifecycle_state", "pending_delete_at");
    `);
  }

  await updateAssetClassConstraintsForBadges(db);

  await db.execute(resetMigrationTimeouts);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(setMigrationTimeouts);

  await revertAssetClassConstraints(db);

  if (await tableExists(db, HONOR_BADGE_MEDIA_REGCLASS)) {
    await db.execute(sql`
      DROP INDEX IF EXISTS "honor_badge_media_lifecycle_state_idx";
    `);

    await dropLifecycleColumns(db);
  }

  await db.execute(resetMigrationTimeouts);
}
