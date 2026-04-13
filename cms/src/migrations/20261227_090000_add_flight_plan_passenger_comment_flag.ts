import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TABLE = '"public"."flight_plans"';
const COLUMN = '"passengers_can_comment_on_tasks"';
const LOCK_TIMEOUT = '15s';
const STATEMENT_TIMEOUT = '5min';

const upSql = sql.raw(`
  SET lock_timeout = '${LOCK_TIMEOUT}';
  SET statement_timeout = '${STATEMENT_TIMEOUT}';
  ALTER TABLE ${TABLE}
    ADD COLUMN IF NOT EXISTS ${COLUMN} boolean;
  ALTER TABLE ${TABLE}
    ALTER COLUMN ${COLUMN} SET DEFAULT false;
  UPDATE ${TABLE}
    SET ${COLUMN} = false
    WHERE ${COLUMN} IS NULL;
  RESET statement_timeout;
  RESET lock_timeout;
`);

const downSql = sql.raw(`
  SET lock_timeout = '${LOCK_TIMEOUT}';
  SET statement_timeout = '${STATEMENT_TIMEOUT}';
  ALTER TABLE ${TABLE}
    DROP COLUMN IF EXISTS ${COLUMN};
  RESET statement_timeout;
  RESET lock_timeout;
`);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(upSql);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(downSql);
}
