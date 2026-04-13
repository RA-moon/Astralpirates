import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TASK_STATE_ENUM = 'enum_flight_plan_tasks_state';
const TASK_STATE_ENUM_IDENT = `"public"."${TASK_STATE_ENUM}"`;
const TASK_STATE_ENUM_LITERAL = `'${TASK_STATE_ENUM}'`;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = ${TASK_STATE_ENUM_LITERAL} AND n.nspname = 'public'
        ) THEN
          CREATE TYPE ${TASK_STATE_ENUM_IDENT} AS ENUM (
            'ideation',
            'grooming',
            'ready',
            'in-progress',
            'review',
            'done',
            'live'
          );
        END IF;
      END
      $$;
    `),
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "public"."flight_plan_tasks" (
      "id" serial PRIMARY KEY,
      "flight_plan_id" integer NOT NULL REFERENCES "public"."flight_plans"("id") ON DELETE CASCADE,
      "owner_membership_id" integer NOT NULL REFERENCES "public"."flight_plan_memberships"("id") ON DELETE CASCADE,
      "title" varchar NOT NULL,
      "description" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "state" ${sql.raw(TASK_STATE_ENUM_IDENT)} NOT NULL DEFAULT 'ideation',
      "list_order" double precision DEFAULT 0,
      "assignee_membership_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_tasks_flight_plan_idx"
    ON "public"."flight_plan_tasks" ("flight_plan_id", "state", "list_order");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_tasks_owner_idx"
    ON "public"."flight_plan_tasks" ("owner_membership_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "flight_plan_tasks_owner_idx";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "flight_plan_tasks_flight_plan_idx";
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS "public"."flight_plan_tasks";
  `);

  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = ${TASK_STATE_ENUM_LITERAL} AND n.nspname = 'public'
        ) THEN
          DROP TYPE ${TASK_STATE_ENUM_IDENT};
        END IF;
      END
      $$;
    `),
  );
}
