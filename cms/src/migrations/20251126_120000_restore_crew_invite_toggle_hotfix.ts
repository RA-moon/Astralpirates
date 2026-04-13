import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TABLE = '"public"."flight_plans"';
const COLUMN = '"crew_can_invite_passengers"';

// Hotfix: restore the column dropped in 20251119_150000_remove_crew_invite_toggle.ts
// while the API still selects it. Keep this migration idempotent so replaying is safe.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${sql.raw(TABLE)}
    ADD COLUMN IF NOT EXISTS ${sql.raw(COLUMN)} boolean NOT NULL DEFAULT false;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${sql.raw(TABLE)}
    DROP COLUMN IF EXISTS ${sql.raw(COLUMN)};
  `);
}
