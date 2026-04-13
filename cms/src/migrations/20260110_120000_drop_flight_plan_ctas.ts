import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "public"."flight_plans"
    DROP COLUMN IF EXISTS "cta_label",
    DROP COLUMN IF EXISTS "cta_href";
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "public"."flight_plans"
    ADD COLUMN IF NOT EXISTS "cta_label" varchar,
    ADD COLUMN IF NOT EXISTS "cta_href" varchar;
  `);
}
