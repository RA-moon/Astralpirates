import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
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
  await db.execute(sql`
    DROP INDEX IF EXISTS "users_last_active_at_idx";
  `);

  await db.execute(sql`
    ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "current_route";
  `);
}
