import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'name'
      ) THEN
        ALTER TABLE "public"."users" RENAME COLUMN "name" TO "first_name";
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    ALTER TABLE "public"."users" ADD COLUMN IF NOT EXISTS "last_name" varchar;
  `);

  await db.execute(sql`
    UPDATE "public"."users"
    SET first_name = NULLIF(BTRIM(first_name), '')
    WHERE first_name IS NOT NULL;
  `);

  await db.execute(sql`
    UPDATE "public"."users"
    SET last_name = NULLIF(BTRIM(last_name), '')
    WHERE last_name IS NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "last_name";
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'first_name'
      ) THEN
        ALTER TABLE "public"."users" RENAME COLUMN "first_name" TO "name";
      END IF;
    END
    $$;
  `);
}
