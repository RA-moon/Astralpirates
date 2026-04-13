import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const GALLERY_IMAGES_TABLE = sql.raw('"gallery_images"');
const FLIGHT_PLANS_TABLE = sql.raw('"flight_plans"');
const USERS_TABLE = sql.raw('"users"');
const SLIDES_TABLE = sql.raw('"flight_plans_gallery_slides"');

const IDX_GALLERY_FLIGHT_PLAN = sql.identifier('gallery_images_flight_plan_idx');
const IDX_GALLERY_UPLOADED_BY = sql.identifier('gallery_images_uploaded_by_idx');
const IDX_GALLERY_UPDATED_AT = sql.identifier('gallery_images_updated_at_idx');
const IDX_GALLERY_CREATED_AT = sql.identifier('gallery_images_created_at_idx');
const IDX_GALLERY_FILENAME = sql.identifier('gallery_images_filename_idx');
const IDX_GALLERY_THUMB_FILENAME = sql.identifier('gallery_images_sizes_thumbnail_filename_idx');
const IDX_GALLERY_PREVIEW_FILENAME = sql.identifier('gallery_images_sizes_preview_filename_idx');

const FK_GALLERY_FLIGHT_PLAN = sql.identifier('gallery_images_flight_plan_fk');
const FK_GALLERY_UPLOADED_BY = sql.identifier('gallery_images_uploaded_by_fk');
const FK_SLIDES_GALLERY_IMAGE = sql.identifier('flight_plan_gallery_slide_image_fk');

const IDX_SLIDES_GALLERY_IMAGE = sql.identifier('flight_plan_gallery_slide_image_idx');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${GALLERY_IMAGES_TABLE} (
      "id" serial PRIMARY KEY,
      "flight_plan_id" integer NOT NULL,
      "uploaded_by_id" integer,
      "alt" varchar,
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
      "sizes_preview_url" varchar,
      "sizes_preview_width" numeric,
      "sizes_preview_height" numeric,
      "sizes_preview_mime_type" varchar,
      "sizes_preview_filesize" numeric,
      "sizes_preview_filename" varchar,
      "created_at" timestamptz(3) DEFAULT now() NOT NULL,
      "updated_at" timestamptz(3) DEFAULT now() NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${IDX_GALLERY_FLIGHT_PLAN}
    ON ${GALLERY_IMAGES_TABLE} ("flight_plan_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${IDX_GALLERY_UPLOADED_BY}
    ON ${GALLERY_IMAGES_TABLE} ("uploaded_by_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${IDX_GALLERY_UPDATED_AT}
    ON ${GALLERY_IMAGES_TABLE} ("updated_at");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${IDX_GALLERY_CREATED_AT}
    ON ${GALLERY_IMAGES_TABLE} ("created_at");
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ${IDX_GALLERY_FILENAME}
    ON ${GALLERY_IMAGES_TABLE} ("filename");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${IDX_GALLERY_THUMB_FILENAME}
    ON ${GALLERY_IMAGES_TABLE} ("sizes_thumbnail_filename");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${IDX_GALLERY_PREVIEW_FILENAME}
    ON ${GALLERY_IMAGES_TABLE} ("sizes_preview_filename");
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${GALLERY_IMAGES_TABLE}
      ADD CONSTRAINT ${FK_GALLERY_FLIGHT_PLAN}
      FOREIGN KEY ("flight_plan_id") REFERENCES ${FLIGHT_PLANS_TABLE}("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${GALLERY_IMAGES_TABLE}
      ADD CONSTRAINT ${FK_GALLERY_UPLOADED_BY}
      FOREIGN KEY ("uploaded_by_id") REFERENCES ${USERS_TABLE}("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    ALTER TABLE ${SLIDES_TABLE}
    ADD COLUMN IF NOT EXISTS "title" varchar,
    ADD COLUMN IF NOT EXISTS "image_type" varchar DEFAULT 'url',
    ADD COLUMN IF NOT EXISTS "gallery_image_id" integer;
  `);

  await db.execute(sql`
    UPDATE ${SLIDES_TABLE}
    SET "image_type" = COALESCE("image_type", 'url');
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${IDX_SLIDES_GALLERY_IMAGE}
    ON ${SLIDES_TABLE} ("gallery_image_id");
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${SLIDES_TABLE}
      ADD CONSTRAINT ${FK_SLIDES_GALLERY_IMAGE}
      FOREIGN KEY ("gallery_image_id") REFERENCES ${GALLERY_IMAGES_TABLE}("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${SLIDES_TABLE}
    DROP CONSTRAINT IF EXISTS ${FK_SLIDES_GALLERY_IMAGE};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${IDX_SLIDES_GALLERY_IMAGE};
  `);

  await db.execute(sql`
    ALTER TABLE ${SLIDES_TABLE}
    DROP COLUMN IF EXISTS "gallery_image_id",
    DROP COLUMN IF EXISTS "image_type",
    DROP COLUMN IF EXISTS "title";
  `);

  await db.execute(sql`
    ALTER TABLE ${GALLERY_IMAGES_TABLE}
    DROP CONSTRAINT IF EXISTS ${FK_GALLERY_FLIGHT_PLAN};
  `);

  await db.execute(sql`
    ALTER TABLE ${GALLERY_IMAGES_TABLE}
    DROP CONSTRAINT IF EXISTS ${FK_GALLERY_UPLOADED_BY};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${IDX_GALLERY_FLIGHT_PLAN};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${IDX_GALLERY_UPLOADED_BY};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${IDX_GALLERY_UPDATED_AT};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${IDX_GALLERY_CREATED_AT};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${IDX_GALLERY_FILENAME};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${IDX_GALLERY_THUMB_FILENAME};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${IDX_GALLERY_PREVIEW_FILENAME};
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS ${GALLERY_IMAGES_TABLE};
  `);
}
