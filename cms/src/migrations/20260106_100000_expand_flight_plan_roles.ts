import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const ROLE_TYPE = '"public"."enum_flight_plan_memberships_role"';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_flight_plan_memberships_role'
          AND n.nspname = 'public'
      ) THEN
        BEGIN
          EXECUTE 'ALTER TYPE ${sql.raw(ROLE_TYPE)} ADD VALUE IF NOT EXISTS ''crew''';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END;
        BEGIN
          EXECUTE 'ALTER TYPE ${sql.raw(ROLE_TYPE)} ADD VALUE IF NOT EXISTS ''guest''';
        EXCEPTION
          WHEN duplicate_object THEN NULL;
        END;
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    UPDATE "public"."flight_plan_memberships"
    SET "role" = 'crew'
    WHERE "role"::text = 'participant';
  `);

  await db.execute(sql`
    ALTER TABLE "public"."flight_plan_memberships"
    ALTER COLUMN "role" SET DEFAULT 'guest';
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "public"."flight_plan_memberships"
    SET "role" = 'participant'
    WHERE "role"::text = 'crew';
  `);

  await db.execute(sql`
    ALTER TABLE "public"."flight_plan_memberships"
    ALTER COLUMN "role" SET DEFAULT 'participant';
  `);
}
