import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_users_role' AND n.nspname = 'public'
      ) THEN
        CREATE TYPE "public"."enum_users_role" AS ENUM ('captain', 'swabbie');
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "users_skills" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "users_links" (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "label" varchar NOT NULL,
      "url" varchar NOT NULL
    );
  `);

  await db.execute(sql`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role" "public"."enum_users_role";
  `);
  await db.execute(sql`
    ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'swabbie'::"public"."enum_users_role";
  `);
  await db.execute(sql`
    UPDATE "users" SET "role" = 'swabbie'::"public"."enum_users_role" WHERE "role" IS NULL;
  `);
  await db.execute(sql`
    ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;
  `);

  await db.execute(sql`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "call_sign" varchar;
  `);
  await db.execute(sql`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "pronouns" varchar;
  `);
  await db.execute(sql`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" varchar;
  `);
  await db.execute(sql`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text;
  `);
  await db.execute(sql`
    ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_slug" varchar;
  `);

  await db.execute(sql`
    ALTER TABLE "flight_plans" ADD COLUMN IF NOT EXISTS "owner_id" integer;
  `);
  await db.execute(sql`
    ALTER TABLE "logs" ADD COLUMN IF NOT EXISTS "owner_id" integer;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "users_skills_order_idx" ON "users_skills" USING btree ("_order");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "users_skills_parent_id_idx" ON "users_skills" USING btree ("_parent_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "users_links_order_idx" ON "users_links" USING btree ("_order");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "users_links_parent_id_idx" ON "users_links" USING btree ("_parent_id");
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "users_profile_slug_idx" ON "users" USING btree ("profile_slug");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plans_owner_idx" ON "flight_plans" USING btree ("owner_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "logs_owner_idx" ON "logs" USING btree ("owner_id");
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conname = 'users_skills_parent_id_fk'
      ) THEN
        ALTER TABLE "users_skills"
        ADD CONSTRAINT "users_skills_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conname = 'users_links_parent_id_fk'
      ) THEN
        ALTER TABLE "users_links"
        ADD CONSTRAINT "users_links_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conname = 'flight_plans_owner_fk'
      ) THEN
        ALTER TABLE "flight_plans"
        ADD CONSTRAINT "flight_plans_owner_fk"
        FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conname = 'logs_owner_fk'
      ) THEN
        ALTER TABLE "logs"
        ADD CONSTRAINT "logs_owner_fk"
        FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    WITH captain AS (
      SELECT id FROM "public"."users" WHERE email = 'captain@astralpirates.com' LIMIT 1
    )
    UPDATE "public"."flight_plans" fp
    SET owner_id = (SELECT id FROM captain)
    WHERE owner_id IS NULL;
  `);

  await db.execute(sql`
    WITH captain AS (
      SELECT id FROM "public"."users" WHERE email = 'captain@astralpirates.com' LIMIT 1
    )
    UPDATE "public"."logs" l
    SET owner_id = (SELECT id FROM captain)
    WHERE owner_id IS NULL;
  `);

  await db.execute(sql`
    UPDATE "public"."users"
    SET profile_slug = COALESCE(
      profile_slug,
      regexp_replace(lower(split_part(email, '@', 1)), '[^a-z0-9]+', '-', 'g')
    );
  `);
  await db.execute(sql`
    ALTER TABLE "users" ALTER COLUMN "profile_slug" SET NOT NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS "users_skills" CASCADE;`);
  await db.execute(sql`DROP TABLE IF EXISTS "users_links" CASCADE;`);

  await db.execute(sql`
    ALTER TABLE "flight_plans" DROP CONSTRAINT IF EXISTS "flight_plans_owner_fk";
    DROP INDEX IF EXISTS "flight_plans_owner_idx";
    ALTER TABLE "flight_plans" DROP COLUMN IF EXISTS "owner_id";
  `);

  await db.execute(sql`
    ALTER TABLE "logs" DROP CONSTRAINT IF EXISTS "logs_owner_fk";
    DROP INDEX IF EXISTS "logs_owner_idx";
    ALTER TABLE "logs" DROP COLUMN IF EXISTS "owner_id";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "users_profile_slug_idx";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "profile_slug";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "role";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "call_sign";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "pronouns";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_url";
    ALTER TABLE "users" DROP COLUMN IF EXISTS "bio";
  `);

  await db.execute(sql`DROP TYPE IF EXISTS "public"."enum_users_role";`);
}
