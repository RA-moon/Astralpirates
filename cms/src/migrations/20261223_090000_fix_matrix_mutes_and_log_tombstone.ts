import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const LOGS_TABLE = sql.raw('"public"."logs"');
const MATRIX_MUTES_TABLE = sql.raw('"public"."matrix_flight_plan_mutes"');
const LOCKED_RELS_TABLE = sql.raw('"public"."payload_locked_documents_rels"');
const USERS_TABLE = sql.raw('"public"."users"');
const FLIGHT_PLANS_TABLE = sql.raw('"public"."flight_plans"');

const MATRIX_RECORD_KEY_IDX = sql.identifier('matrix_flight_plan_mutes_record_key_idx');
const MATRIX_USER_IDX = sql.identifier('matrix_flight_plan_mutes_user_idx');
const MATRIX_FLIGHT_PLAN_IDX = sql.identifier('matrix_flight_plan_mutes_flight_plan_idx');
const MATRIX_UPDATED_AT_IDX = sql.identifier('matrix_flight_plan_mutes_updated_at_idx');
const MATRIX_CREATED_AT_IDX = sql.identifier('matrix_flight_plan_mutes_created_at_idx');
const MATRIX_USER_FK = sql.identifier('matrix_flight_plan_mutes_user_fk');
const MATRIX_FLIGHT_PLAN_FK = sql.identifier('matrix_flight_plan_mutes_flight_plan_fk');

const LOCKED_COLUMN = '"matrix_flight_plan_mutes_id"';
const LOCKED_INDEX = sql.identifier('payload_locked_documents_rels_matrix_flight_plan_mutes_i_idx');
const LOCKED_FK = sql.identifier('payload_locked_documents_rels_matrix_flight_plan_mutes_fk');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${LOGS_TABLE}
    ADD COLUMN IF NOT EXISTS "flight_plan_tombstone" jsonb;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${MATRIX_MUTES_TABLE} (
      "id" serial PRIMARY KEY,
      "record_key" varchar NOT NULL,
      "user_id" integer NOT NULL,
      "flight_plan_id" integer NOT NULL,
      "muted" boolean NOT NULL DEFAULT true,
      "muted_at" timestamptz(3) NOT NULL,
      "updated_at" timestamptz(3) NOT NULL DEFAULT now(),
      "created_at" timestamptz(3) NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ${MATRIX_RECORD_KEY_IDX}
    ON ${MATRIX_MUTES_TABLE} ("record_key");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${MATRIX_USER_IDX}
    ON ${MATRIX_MUTES_TABLE} ("user_id");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${MATRIX_FLIGHT_PLAN_IDX}
    ON ${MATRIX_MUTES_TABLE} ("flight_plan_id");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${MATRIX_UPDATED_AT_IDX}
    ON ${MATRIX_MUTES_TABLE} ("updated_at");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${MATRIX_CREATED_AT_IDX}
    ON ${MATRIX_MUTES_TABLE} ("created_at");
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${MATRIX_MUTES_TABLE}
      ADD CONSTRAINT ${MATRIX_USER_FK}
      FOREIGN KEY ("user_id") REFERENCES ${USERS_TABLE}("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${MATRIX_MUTES_TABLE}
      ADD CONSTRAINT ${MATRIX_FLIGHT_PLAN_FK}
      FOREIGN KEY ("flight_plan_id") REFERENCES ${FLIGHT_PLANS_TABLE}("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
    ADD COLUMN IF NOT EXISTS ${sql.raw(LOCKED_COLUMN)} integer;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${LOCKED_INDEX}
    ON ${LOCKED_RELS_TABLE} (${sql.raw(LOCKED_COLUMN)});
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${LOCKED_RELS_TABLE}
      ADD CONSTRAINT ${LOCKED_FK}
      FOREIGN KEY (${sql.raw(LOCKED_COLUMN)}) REFERENCES ${MATRIX_MUTES_TABLE}("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db: _db }: MigrateDownArgs): Promise<void> {
  // Keep hotfix schema changes in place for rollback safety and repeatable deploys.
  return Promise.resolve();
}
