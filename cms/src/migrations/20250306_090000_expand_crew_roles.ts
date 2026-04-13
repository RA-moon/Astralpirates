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
        EXECUTE 'DROP TYPE IF EXISTS "public"."enum_users_role_new"';
        EXECUTE 'CREATE TYPE "public"."enum_users_role_new" AS ENUM (''captain'', ''quartermaster'', ''sailing-master'', ''boatswain'', ''gunner'', ''carpenter'', ''surgeon'', ''master-at-arms'', ''cook'', ''seamen'', ''powder-monkey'', ''cabin-boy'', ''swabbie'')';

        EXECUTE 'ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT';
        EXECUTE 'ALTER TABLE "public"."users" ALTER COLUMN "role" TYPE "public"."enum_users_role_new" USING "role"::text::"public"."enum_users_role_new"';
        EXECUTE 'ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT ''swabbie''::"public"."enum_users_role_new"';

        EXECUTE 'DROP TYPE "public"."enum_users_role"';
        EXECUTE 'ALTER TYPE "public"."enum_users_role_new" RENAME TO "enum_users_role"';
      ELSE
        EXECUTE 'CREATE TYPE "public"."enum_users_role" AS ENUM (''captain'', ''quartermaster'', ''sailing-master'', ''boatswain'', ''gunner'', ''carpenter'', ''surgeon'', ''master-at-arms'', ''cook'', ''seamen'', ''powder-monkey'', ''cabin-boy'', ''swabbie'')';
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

      EXECUTE '
        UPDATE "public"."users"
        SET "role" = ''swabbie''::"public"."enum_users_role"
        WHERE "role" IN (
          ''quartermaster'',
          ''sailing-master'',
          ''boatswain'',
          ''gunner'',
          ''carpenter'',
          ''surgeon'',
          ''master-at-arms'',
          ''cook'',
          ''seamen'',
          ''powder-monkey''
        )
      ';

      EXECUTE 'DROP TYPE IF EXISTS "public"."enum_users_role_new"';
      EXECUTE 'CREATE TYPE "public"."enum_users_role_new" AS ENUM (''captain'', ''cabin-boy'', ''swabbie'')';

      EXECUTE 'ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT';
      EXECUTE 'ALTER TABLE "public"."users" ALTER COLUMN "role" TYPE "public"."enum_users_role_new" USING "role"::text::"public"."enum_users_role_new"';
      EXECUTE 'ALTER TABLE "public"."users" ALTER COLUMN "role" SET DEFAULT ''swabbie''::"public"."enum_users_role_new"';

      EXECUTE 'DROP TYPE "public"."enum_users_role"';
      EXECUTE 'ALTER TYPE "public"."enum_users_role_new" RENAME TO "enum_users_role"';
    END
    $$;
  `);
}
