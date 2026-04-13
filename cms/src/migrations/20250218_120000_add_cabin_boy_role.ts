import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_users_role' AND n.nspname = 'public'
      ) THEN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          WHERE e.enumtypid = 'enum_users_role'::regtype AND e.enumlabel = 'cabin-boy'
        ) THEN
          EXECUTE 'ALTER TYPE "public"."enum_users_role" ADD VALUE ''cabin-boy''';
        END IF;
      END IF;
    END
    $$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_users_role' AND n.nspname = 'public'
      ) THEN
        RETURN;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        WHERE e.enumtypid = 'enum_users_role'::regtype AND e.enumlabel = 'cabin-boy'
      ) THEN
        RETURN;
      END IF;

      EXECUTE 'UPDATE "public"."users" SET "role" = ''swabbie''::"public"."enum_users_role" WHERE "role" = ''cabin-boy''::"public"."enum_users_role"';

      EXECUTE 'DROP TYPE IF EXISTS "public"."enum_users_role_new"';
      EXECUTE 'CREATE TYPE "public"."enum_users_role_new" AS ENUM (''captain'', ''swabbie'')';

      EXECUTE 'ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT';
      EXECUTE 'ALTER TABLE "public"."users" ALTER COLUMN "role" TYPE "public"."enum_users_role_new" USING "role"::text::"public"."enum_users_role_new"';
      EXECUTE 'ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT ''swabbie''::"public"."enum_users_role_new"';

      EXECUTE 'DROP TYPE "public"."enum_users_role"';
      EXECUTE 'ALTER TYPE "public"."enum_users_role_new" RENAME TO "enum_users_role"';
    END
    $$;
  `);
}
