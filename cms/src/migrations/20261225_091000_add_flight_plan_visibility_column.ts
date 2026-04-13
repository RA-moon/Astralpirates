import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TABLE = '"public"."flight_plans"';
const LOCK_TIMEOUT = '15s';
const STATEMENT_TIMEOUT = '5min';

const visibilityColumnUp = sql.raw(`
  SET lock_timeout = '${LOCK_TIMEOUT}';
  SET statement_timeout = '${STATEMENT_TIMEOUT}';
  ALTER TABLE ${TABLE}
  ADD COLUMN IF NOT EXISTS "visibility" varchar;
  RESET statement_timeout;
  RESET lock_timeout;
`);

const visibilityColumnDown = sql.raw(`
  SET lock_timeout = '${LOCK_TIMEOUT}';
  SET statement_timeout = '${STATEMENT_TIMEOUT}';
  ALTER TABLE ${TABLE}
  DROP COLUMN IF EXISTS "visibility";
  RESET statement_timeout;
  RESET lock_timeout;
`);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(visibilityColumnUp);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(visibilityColumnDown);
}
