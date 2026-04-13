import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const GALLERY_IMAGES_TABLE = sql.raw('"gallery_images"');
const FLIGHT_PLAN_SLIDES_TABLE = sql.raw('"flight_plans_gallery_slides"');
const PAGE_SLIDES_TABLE = sql.raw('"pages_blocks_image_carousel_slides"');

const SINGLE_OWNER_CONSTRAINT = sql.identifier('gallery_images_single_owner_ck');
const FLIGHT_PLAN_LOOKUP_INDEX = sql.identifier(
  'flight_plans_gallery_slides_gallery_image_parent_idx',
);
const PAGE_LOOKUP_INDEX = sql.identifier(
  'pages_blocks_image_carousel_slides_gallery_image_parent_idx',
);

const LOCK_TIMEOUT = '15s';
const STATEMENT_TIMEOUT = '5min';

const setMigrationTimeouts = sql.raw(`
  SET lock_timeout = '${LOCK_TIMEOUT}';
  SET statement_timeout = '${STATEMENT_TIMEOUT}';
`);

const resetMigrationTimeouts = sql.raw(`
  RESET statement_timeout;
  RESET lock_timeout;
`);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(setMigrationTimeouts);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${GALLERY_IMAGES_TABLE}
      ADD CONSTRAINT ${SINGLE_OWNER_CONSTRAINT}
      CHECK ("flight_plan_id" IS NULL OR "page_id" IS NULL);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLAN_LOOKUP_INDEX}
    ON ${FLIGHT_PLAN_SLIDES_TABLE} ("gallery_image_id", "_parent_id");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${PAGE_LOOKUP_INDEX}
    ON ${PAGE_SLIDES_TABLE} ("gallery_image_id", "_parent_id");
  `);

  await db.execute(sql`
    ALTER TABLE ${GALLERY_IMAGES_TABLE}
    SET (
      autovacuum_vacuum_scale_factor = 0.05,
      autovacuum_analyze_scale_factor = 0.02
    );
  `);

  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLAN_SLIDES_TABLE}
    SET (
      autovacuum_vacuum_scale_factor = 0.05,
      autovacuum_analyze_scale_factor = 0.02
    );
  `);

  await db.execute(sql`
    ALTER TABLE ${PAGE_SLIDES_TABLE}
    SET (
      autovacuum_vacuum_scale_factor = 0.05,
      autovacuum_analyze_scale_factor = 0.02
    );
  `);

  await db.execute(resetMigrationTimeouts);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(setMigrationTimeouts);

  await db.execute(sql`
    ALTER TABLE ${GALLERY_IMAGES_TABLE}
    DROP CONSTRAINT IF EXISTS ${SINGLE_OWNER_CONSTRAINT};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLAN_LOOKUP_INDEX};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${PAGE_LOOKUP_INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${GALLERY_IMAGES_TABLE}
    RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
  `);

  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLAN_SLIDES_TABLE}
    RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
  `);

  await db.execute(sql`
    ALTER TABLE ${PAGE_SLIDES_TABLE}
    RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
  `);

  await db.execute(resetMigrationTimeouts);
}
