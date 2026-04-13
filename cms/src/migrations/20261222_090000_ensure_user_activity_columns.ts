import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "public"."users"
    ADD COLUMN IF NOT EXISTS "last_active_at" timestamp(3) with time zone;
  `);

  await db.execute(sql`
    ALTER TABLE "public"."users"
    ADD COLUMN IF NOT EXISTS "current_route" varchar;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "users_last_active_at_idx"
    ON "public"."users" ("last_active_at" DESC NULLS LAST);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Keep the columns/index in place for rollback safety and repeatable deploys.
  return Promise.resolve();
}
