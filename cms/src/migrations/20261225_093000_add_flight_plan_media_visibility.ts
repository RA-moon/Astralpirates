import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TABLE = '"public"."flight_plans"';
const COLUMN = '"media_visibility"';
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${sql.raw(TABLE)}
    ADD COLUMN IF NOT EXISTS ${sql.raw(COLUMN)} varchar NOT NULL DEFAULT 'inherit';
  `);

  await db.execute(sql`
    UPDATE ${sql.raw(TABLE)}
    SET ${sql.raw(COLUMN)} = 'inherit'
    WHERE ${sql.raw(COLUMN)} IS NULL;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${sql.raw(TABLE)}
    DROP COLUMN IF EXISTS ${sql.raw(COLUMN)};
  `);
}
