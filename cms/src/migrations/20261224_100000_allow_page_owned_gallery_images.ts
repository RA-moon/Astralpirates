import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const GALLERY_TABLE = sql.raw('"public"."gallery_images"');
const PAGES_TABLE = sql.raw('"public"."pages"');

const PAGE_INDEX = sql.identifier('gallery_images_page_idx');
const PAGE_FK = sql.identifier('gallery_images_page_fk');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${GALLERY_TABLE}
    ADD COLUMN IF NOT EXISTS "page_id" integer;
  `);

  await db.execute(sql`
    ALTER TABLE ${GALLERY_TABLE}
    ALTER COLUMN "flight_plan_id" DROP NOT NULL;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${PAGE_INDEX}
    ON ${GALLERY_TABLE} ("page_id");
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${GALLERY_TABLE}
      ADD CONSTRAINT ${PAGE_FK}
      FOREIGN KEY ("page_id") REFERENCES ${PAGES_TABLE}("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${GALLERY_TABLE}
    DROP CONSTRAINT IF EXISTS ${PAGE_FK};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${PAGE_INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${GALLERY_TABLE}
    DROP COLUMN IF EXISTS "page_id";
  `);

  await db.execute(sql`
    DO $$BEGIN
      IF NOT EXISTS (SELECT 1 FROM ${GALLERY_TABLE} WHERE "flight_plan_id" IS NULL) THEN
        ALTER TABLE ${GALLERY_TABLE}
        ALTER COLUMN "flight_plan_id" SET NOT NULL;
      END IF;
    END$$;
  `);
}
