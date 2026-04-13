import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const LOCKED_RELS_TABLE = sql.raw('"public"."payload_locked_documents_rels"');
const FLIGHT_PLAN_SERIES_TABLE = sql.raw('"public"."flight_plan_series"');
const FLIGHT_PLAN_STATUS_EVENTS_TABLE = sql.raw('"public"."flight_plan_status_events"');

const FLIGHT_PLAN_SERIES_INDEX = sql.identifier(
  'payload_locked_documents_rels_flight_plan_series_id_idx',
);
const FLIGHT_PLAN_STATUS_EVENTS_INDEX = sql.identifier(
  'payload_locked_documents_rels_flight_plan_status_events__idx',
);
const FLIGHT_PLAN_SERIES_FK = sql.identifier(
  'payload_locked_documents_rels_flight_plan_series_fk',
);
const FLIGHT_PLAN_STATUS_EVENTS_FK = sql.identifier(
  'payload_locked_documents_rels_flight_plan_status_events_fk',
);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
      ADD COLUMN IF NOT EXISTS flight_plan_series_id integer,
      ADD COLUMN IF NOT EXISTS flight_plan_status_events_id integer;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLAN_SERIES_INDEX}
      ON ${LOCKED_RELS_TABLE}(flight_plan_series_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLAN_STATUS_EVENTS_INDEX}
      ON ${LOCKED_RELS_TABLE}(flight_plan_status_events_id);
  `);

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE ${LOCKED_RELS_TABLE}
        ADD CONSTRAINT ${FLIGHT_PLAN_SERIES_FK}
        FOREIGN KEY (flight_plan_series_id)
        REFERENCES ${FLIGHT_PLAN_SERIES_TABLE}(id)
        ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE ${LOCKED_RELS_TABLE}
        ADD CONSTRAINT ${FLIGHT_PLAN_STATUS_EVENTS_FK}
        FOREIGN KEY (flight_plan_status_events_id)
        REFERENCES ${FLIGHT_PLAN_STATUS_EVENTS_TABLE}(id)
        ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
      DROP CONSTRAINT IF EXISTS ${FLIGHT_PLAN_STATUS_EVENTS_FK};
  `);

  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
      DROP CONSTRAINT IF EXISTS ${FLIGHT_PLAN_SERIES_FK};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLAN_STATUS_EVENTS_INDEX};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLAN_SERIES_INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
      DROP COLUMN IF EXISTS flight_plan_status_events_id;
  `);

  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
      DROP COLUMN IF EXISTS flight_plan_series_id;
  `);
}
