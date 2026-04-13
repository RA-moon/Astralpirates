import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TASKS_TABLE = sql.raw(`"public"."flight_plan_tasks"`);
const COLUMN = '"test_run_cadence"';
const ENUM_NAME = 'enum_flight_plan_tasks_test_run_cadence';
const ENUM_IDENT = `"public"."${ENUM_NAME}"`;
const ENUM_LITERAL = `'${ENUM_NAME}'`;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = ${ENUM_LITERAL} AND n.nspname = 'public'
        ) THEN
          CREATE TYPE ${ENUM_IDENT} AS ENUM (
            'on-touch',
            'on-update',
            'repeat-1',
            'repeat-2',
            'repeat-3',
            'never'
          );
        END IF;
      END
      $$;
    `),
  );

  await db.execute(sql`
    ALTER TABLE ${TASKS_TABLE}
    ADD COLUMN IF NOT EXISTS ${sql.raw(COLUMN)} ${sql.raw(ENUM_IDENT)};
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${TASKS_TABLE}
    DROP COLUMN IF EXISTS ${sql.raw(COLUMN)};
  `);

  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = ${ENUM_LITERAL} AND n.nspname = 'public'
        ) THEN
          DROP TYPE ${ENUM_IDENT};
        END IF;
      END
      $$;
    `),
  );
}
