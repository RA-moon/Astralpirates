import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TABLE = sql.raw('"public"."pages_blocks_image_carousel_slides"');
const GALLERY_IMAGES_TABLE = sql.raw('"public"."gallery_images"');

const IMAGE_TYPE_CHECK = sql.identifier('pages_blocks_image_carousel_slides_image_type_chk');
const GALLERY_IMAGE_INDEX = sql.identifier('pages_blocks_image_carousel_slides_gallery_image_idx');
const GALLERY_IMAGE_FK = sql.identifier('pages_blocks_image_carousel_slides_gallery_image_fk');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${TABLE}
    ADD COLUMN IF NOT EXISTS "title" varchar,
    ADD COLUMN IF NOT EXISTS "image_type" varchar,
    ADD COLUMN IF NOT EXISTS "gallery_image_id" integer;
  `);

  await db.execute(sql`
    UPDATE ${TABLE}
    SET "image_type" = CASE
      WHEN "image_type" IN ('upload', 'url') THEN "image_type"
      WHEN COALESCE("image_url", '') <> '' THEN 'url'
      ELSE 'upload'
    END;
  `);

  await db.execute(sql`
    ALTER TABLE ${TABLE}
    ALTER COLUMN "image_type" SET DEFAULT 'upload',
    ALTER COLUMN "image_type" SET NOT NULL,
    ALTER COLUMN "image_url" DROP NOT NULL;
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${TABLE}
      ADD CONSTRAINT ${IMAGE_TYPE_CHECK}
      CHECK ("image_type" IN ('upload', 'url'));
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${GALLERY_IMAGE_INDEX}
    ON ${TABLE} ("gallery_image_id");
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${TABLE}
      ADD CONSTRAINT ${GALLERY_IMAGE_FK}
      FOREIGN KEY ("gallery_image_id") REFERENCES ${GALLERY_IMAGES_TABLE}("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${TABLE}
    DROP CONSTRAINT IF EXISTS ${GALLERY_IMAGE_FK};
  `);

  await db.execute(sql`
    ALTER TABLE ${TABLE}
    DROP CONSTRAINT IF EXISTS ${IMAGE_TYPE_CHECK};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${GALLERY_IMAGE_INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${TABLE}
    DROP COLUMN IF EXISTS "gallery_image_id",
    DROP COLUMN IF EXISTS "image_type",
    DROP COLUMN IF EXISTS "title";
  `);
}
