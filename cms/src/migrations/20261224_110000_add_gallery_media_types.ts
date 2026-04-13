import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const FLIGHT_PLAN_SLIDES_TABLE = sql.raw('"public"."flight_plans_gallery_slides"');
const PAGE_CAROUSEL_SLIDES_TABLE = sql.raw('"public"."pages_blocks_image_carousel_slides"');

const FLIGHT_PLAN_MEDIA_TYPE_CHECK = sql.identifier(
  'flight_plans_gallery_slides_media_type_chk',
);
const PAGE_CAROUSEL_MEDIA_TYPE_CHECK = sql.identifier(
  'pages_blocks_image_carousel_slides_media_type_chk',
);

const MEDIA_TYPE_CHECK_SQL = sql`CHECK ("media_type" IN ('image', 'video', 'model'))`;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLAN_SLIDES_TABLE}
    ADD COLUMN IF NOT EXISTS "media_type" varchar;
  `);

  await db.execute(sql`
    ALTER TABLE ${PAGE_CAROUSEL_SLIDES_TABLE}
    ADD COLUMN IF NOT EXISTS "media_type" varchar;
  `);

  await db.execute(sql`
    UPDATE ${FLIGHT_PLAN_SLIDES_TABLE}
    SET "media_type" = CASE
      WHEN "media_type" IN ('image', 'video', 'model') THEN "media_type"
      ELSE 'image'
    END;
  `);

  await db.execute(sql`
    UPDATE ${PAGE_CAROUSEL_SLIDES_TABLE}
    SET "media_type" = CASE
      WHEN "media_type" IN ('image', 'video', 'model') THEN "media_type"
      ELSE 'image'
    END;
  `);

  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLAN_SLIDES_TABLE}
    ALTER COLUMN "media_type" SET DEFAULT 'image',
    ALTER COLUMN "media_type" SET NOT NULL;
  `);

  await db.execute(sql`
    ALTER TABLE ${PAGE_CAROUSEL_SLIDES_TABLE}
    ALTER COLUMN "media_type" SET DEFAULT 'image',
    ALTER COLUMN "media_type" SET NOT NULL;
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${FLIGHT_PLAN_SLIDES_TABLE}
      ADD CONSTRAINT ${FLIGHT_PLAN_MEDIA_TYPE_CHECK}
      ${MEDIA_TYPE_CHECK_SQL};
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${PAGE_CAROUSEL_SLIDES_TABLE}
      ADD CONSTRAINT ${PAGE_CAROUSEL_MEDIA_TYPE_CHECK}
      ${MEDIA_TYPE_CHECK_SQL};
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLAN_SLIDES_TABLE}
    DROP CONSTRAINT IF EXISTS ${FLIGHT_PLAN_MEDIA_TYPE_CHECK};
  `);

  await db.execute(sql`
    ALTER TABLE ${PAGE_CAROUSEL_SLIDES_TABLE}
    DROP CONSTRAINT IF EXISTS ${PAGE_CAROUSEL_MEDIA_TYPE_CHECK};
  `);

  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLAN_SLIDES_TABLE}
    DROP COLUMN IF EXISTS "media_type";
  `);

  await db.execute(sql`
    ALTER TABLE ${PAGE_CAROUSEL_SLIDES_TABLE}
    DROP COLUMN IF EXISTS "media_type";
  `);
}
