import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const USERS_TABLE = sql.raw('"public"."users"');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    ADD COLUMN IF NOT EXISTS "admin_mode_view_preference" boolean DEFAULT false;
  `);

  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    ADD COLUMN IF NOT EXISTS "admin_mode_edit_preference" boolean DEFAULT false;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    DROP COLUMN IF EXISTS "admin_mode_edit_preference";
  `);

  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    DROP COLUMN IF EXISTS "admin_mode_view_preference";
  `);
}
