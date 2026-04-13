import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TABLE = '"public"."flight_plans"';
const COLUMN = '"crew_can_invite_passengers"';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${sql.raw(TABLE)}
    DROP COLUMN IF EXISTS ${sql.raw(COLUMN)};
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${sql.raw(TABLE)}
    ADD COLUMN IF NOT EXISTS ${sql.raw(COLUMN)} boolean NOT NULL DEFAULT false;
  `);
}
