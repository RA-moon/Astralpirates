import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "public"."logs"
    ADD COLUMN IF NOT EXISTS "flight_plan_id" integer REFERENCES "public"."flight_plans"("id") ON DELETE SET NULL;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "logs_flight_plan_id_idx"
    ON "public"."logs" ("flight_plan_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "logs_flight_plan_id_idx";
  `);

  await db.execute(sql`
    ALTER TABLE "public"."logs"
    DROP COLUMN IF EXISTS "flight_plan_id";
  `);
}
