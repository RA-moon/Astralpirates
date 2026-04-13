import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const USERS_TABLE = sql.raw('"public"."users"');
const AVATARS_TABLE = sql.raw('"public"."avatars"');
const AVATAR_MEDIA_TYPE_CHECK_CONSTRAINT = 'users_avatar_media_type_check';
const AVATAR_MEDIA_ENUM_TYPE = 'enum_users_avatar_media_type';
const AVATAR_MEDIA_ENUM_TYPE_SQL = sql.raw(`"${AVATAR_MEDIA_ENUM_TYPE}"`);
const AVATAR_MEDIA_ENUM_TYPE_LITERAL = sql.raw(`'${AVATAR_MEDIA_ENUM_TYPE}'`);
const AVATAR_MEDIA_TYPE_CHECK_CONSTRAINT_LITERAL = sql.raw(
  `'${AVATAR_MEDIA_TYPE_CHECK_CONSTRAINT}'`,
);

const VIDEO_EXTENSION_PATTERN = '\\.(m4v|mov|mp4|ogg|ogv|webm)$';
const MODEL_EXTENSION_PATTERN = '\\.(fbx|glb|gltf|obj|stl|usdz)$';

const MODEL_MIME_TYPES = [
  'application/vnd.autodesk.fbx',
  'application/x-fbx',
  'model/gltf+json',
  'model/gltf-binary',
  'model/obj',
  'model/stl',
  'model/vnd.fbx',
  'model/vnd.usdz+zip',
] as const;

const MODEL_MIME_SQL_LIST = sql.join(
  MODEL_MIME_TYPES.map((mime) => sql`${mime}`),
  sql`, `,
);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    ADD COLUMN IF NOT EXISTS "avatar_media_type" varchar;
  `);

  // When schema push creates the enum column before migrations run, temporarily
  // normalize to text so backfill expressions do not fail on enum coercion.
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'avatar_media_type'
          AND udt_name = ${AVATAR_MEDIA_ENUM_TYPE_LITERAL}
      ) THEN
        ALTER TABLE ${USERS_TABLE}
        ALTER COLUMN "avatar_media_type" TYPE text
        USING "avatar_media_type"::text;
      END IF;
    END $$;
  `);

  await db.execute(sql`
    UPDATE ${USERS_TABLE} AS u
    SET "avatar_media_type" = CASE
      WHEN LOWER(COALESCE(a."mime_type", '')) LIKE 'video/%' THEN 'video'
      WHEN LOWER(COALESCE(a."mime_type", '')) IN (${MODEL_MIME_SQL_LIST}) THEN 'model'
      WHEN LOWER(COALESCE(a."filename", '')) ~ ${VIDEO_EXTENSION_PATTERN} THEN 'video'
      WHEN LOWER(COALESCE(a."filename", '')) ~ ${MODEL_EXTENSION_PATTERN} THEN 'model'
      WHEN LOWER(COALESCE(u."avatar_url", '')) ~ ${VIDEO_EXTENSION_PATTERN} THEN 'video'
      WHEN LOWER(COALESCE(u."avatar_url", '')) ~ ${MODEL_EXTENSION_PATTERN} THEN 'model'
      ELSE 'image'
    END
    FROM ${AVATARS_TABLE} AS a
    WHERE u."avatar_id" = a."id"
      AND (u."avatar_media_type" IS NULL OR btrim((u."avatar_media_type")::text) = '');
  `);

  await db.execute(sql`
    UPDATE ${USERS_TABLE}
    SET "avatar_media_type" = CASE
      WHEN LOWER(COALESCE("avatar_url", '')) ~ ${VIDEO_EXTENSION_PATTERN} THEN 'video'
      WHEN LOWER(COALESCE("avatar_url", '')) ~ ${MODEL_EXTENSION_PATTERN} THEN 'model'
      ELSE 'image'
    END
    WHERE "avatar_media_type" IS NULL OR btrim(("avatar_media_type")::text) = '';
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = ${AVATAR_MEDIA_ENUM_TYPE_LITERAL}
      ) THEN
        CREATE TYPE ${AVATAR_MEDIA_ENUM_TYPE_SQL} AS ENUM ('image', 'video', 'model');
      END IF;
    END $$;
  `);

  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    ALTER COLUMN "avatar_media_type" TYPE ${AVATAR_MEDIA_ENUM_TYPE_SQL}
    USING "avatar_media_type"::${AVATAR_MEDIA_ENUM_TYPE_SQL};
  `);

  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    ALTER COLUMN "avatar_media_type" SET DEFAULT 'image';
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = ${AVATAR_MEDIA_TYPE_CHECK_CONSTRAINT_LITERAL}
      ) THEN
        ALTER TABLE ${USERS_TABLE}
        ADD CONSTRAINT ${sql.raw(`"${AVATAR_MEDIA_TYPE_CHECK_CONSTRAINT}"`)}
        CHECK ("avatar_media_type" IN ('image', 'video', 'model'));
      END IF;
    END $$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    DROP CONSTRAINT IF EXISTS ${sql.raw(`"${AVATAR_MEDIA_TYPE_CHECK_CONSTRAINT}"`)};
  `);
}
