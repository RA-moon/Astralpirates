import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const FLIGHT_PLANS = sql.raw('"flight_plans"');
const FLIGHT_PLAN_SERIES = sql.raw('"flight_plan_series"');
const FLIGHT_PLAN_STATUS_EVENTS = sql.raw('"flight_plan_status_events"');
const USERS = sql.raw('"users"');

const STATUS_ENUM = sql.identifier('enum_flight_plans_status');
const FLIGHT_PLAN_SERIES_CATEGORY_ENUM = sql.identifier('enum_flight_plan_series_category');
const STATUS_EVENT_FROM_ENUM = sql.identifier('enum_flight_plan_status_events_from_status');
const STATUS_EVENT_TO_ENUM = sql.identifier('enum_flight_plan_status_events_to_status');
const STATUS_EVENT_ACTION_ENUM = sql.identifier('enum_flight_plan_status_events_action_type');

const FLIGHT_PLANS_STATUS_IDX = sql.identifier('flight_plans_status_idx');
const FLIGHT_PLANS_SERIES_IDX = sql.identifier('flight_plans_series_idx');
const FLIGHT_PLANS_PREVIOUS_ITERATION_IDX = sql.identifier('flight_plans_previous_iteration_idx');
const FLIGHT_PLANS_SERIES_ITERATION_UX = sql.identifier('flight_plans_series_iteration_idx');

const FLIGHT_PLAN_SERIES_SLUG_UX = sql.identifier('flight_plan_series_slug_idx');
const FLIGHT_PLAN_SERIES_OWNER_IDX = sql.identifier('flight_plan_series_owner_idx');
const FLIGHT_PLAN_SERIES_CATEGORY_IDX = sql.identifier('flight_plan_series_category_idx');

const FLIGHT_PLAN_STATUS_EVENTS_FLIGHT_PLAN_IDX = sql.identifier('flight_plan_status_events_flight_plan_idx');
const FLIGHT_PLAN_STATUS_EVENTS_CHANGED_BY_IDX = sql.identifier('flight_plan_status_events_changed_by_idx');
const FLIGHT_PLAN_STATUS_EVENTS_CHANGED_AT_IDX = sql.identifier('flight_plan_status_events_changed_at_idx');
const FLIGHT_PLAN_STATUS_EVENTS_ACTION_IDX = sql.identifier('flight_plan_status_events_action_type_idx');

const FLIGHT_PLANS_STATUS_FK = sql.identifier('flight_plans_status_changed_by_fk');
const FLIGHT_PLANS_SERIES_FK = sql.identifier('flight_plans_series_fk');
const FLIGHT_PLANS_PREVIOUS_ITERATION_FK = sql.identifier('flight_plans_previous_iteration_fk');

const STATUS_EVENTS_FLIGHT_PLAN_FK = sql.identifier('flight_plan_status_events_flight_plan_fk');
const STATUS_EVENTS_CHANGED_BY_FK = sql.identifier('flight_plan_status_events_changed_by_fk');

const ITERATION_NUMBER_CHECK = sql.identifier('flight_plans_iteration_number_check');

const LIFECYCLE_STATUS_VALUES = sql.raw("'planned', 'pending', 'ongoing', 'on-hold', 'postponed', 'success', 'failure', 'aborted', 'cancelled'");
const STATUS_EVENT_ACTION_VALUES = sql.raw("'transition', 'reopen', 'normalize', 'backfill'");

const BACKFILL_REASON = 'Lifecycle status backfill (T2.34 migration).';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE ${STATUS_ENUM} AS ENUM (${LIFECYCLE_STATUS_VALUES});
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE ${FLIGHT_PLAN_SERIES_CATEGORY_ENUM} AS ENUM (${sql.raw("'project', 'event', 'test'")});
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE ${STATUS_EVENT_FROM_ENUM} AS ENUM (${LIFECYCLE_STATUS_VALUES});
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE ${STATUS_EVENT_TO_ENUM} AS ENUM (${LIFECYCLE_STATUS_VALUES});
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      CREATE TYPE ${STATUS_EVENT_ACTION_ENUM} AS ENUM (${STATUS_EVENT_ACTION_VALUES});
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${FLIGHT_PLAN_SERIES} (
      id serial PRIMARY KEY,
      slug varchar NOT NULL,
      title varchar NOT NULL,
      category ${FLIGHT_PLAN_SERIES_CATEGORY_ENUM} NOT NULL DEFAULT 'project',
      owner_id integer,
      updated_at timestamp(3) with time zone NOT NULL DEFAULT now(),
      created_at timestamp(3) with time zone NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ${FLIGHT_PLAN_SERIES_SLUG_UX}
    ON ${FLIGHT_PLAN_SERIES}(slug);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLAN_SERIES_OWNER_IDX}
    ON ${FLIGHT_PLAN_SERIES}(owner_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLAN_SERIES_CATEGORY_IDX}
    ON ${FLIGHT_PLAN_SERIES}(category);
  `);

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE ${FLIGHT_PLAN_SERIES}
      ADD CONSTRAINT ${sql.identifier('flight_plan_series_owner_fk')}
      FOREIGN KEY (owner_id) REFERENCES ${USERS}(id)
      ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${FLIGHT_PLAN_STATUS_EVENTS} (
      id serial PRIMARY KEY,
      flight_plan_id integer NOT NULL,
      from_status ${STATUS_EVENT_FROM_ENUM},
      to_status ${STATUS_EVENT_TO_ENUM} NOT NULL,
      reason varchar,
      changed_by_id integer,
      changed_at timestamp(3) with time zone NOT NULL DEFAULT now(),
      action_type ${STATUS_EVENT_ACTION_ENUM} NOT NULL
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLAN_STATUS_EVENTS_FLIGHT_PLAN_IDX}
    ON ${FLIGHT_PLAN_STATUS_EVENTS}(flight_plan_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLAN_STATUS_EVENTS_CHANGED_BY_IDX}
    ON ${FLIGHT_PLAN_STATUS_EVENTS}(changed_by_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLAN_STATUS_EVENTS_CHANGED_AT_IDX}
    ON ${FLIGHT_PLAN_STATUS_EVENTS}(changed_at);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLAN_STATUS_EVENTS_ACTION_IDX}
    ON ${FLIGHT_PLAN_STATUS_EVENTS}(action_type);
  `);

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE ${FLIGHT_PLAN_STATUS_EVENTS}
      ADD CONSTRAINT ${STATUS_EVENTS_FLIGHT_PLAN_FK}
      FOREIGN KEY (flight_plan_id) REFERENCES ${FLIGHT_PLANS}(id)
      ON DELETE CASCADE ON UPDATE NO ACTION;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE ${FLIGHT_PLAN_STATUS_EVENTS}
      ADD CONSTRAINT ${STATUS_EVENTS_CHANGED_BY_FK}
      FOREIGN KEY (changed_by_id) REFERENCES ${USERS}(id)
      ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLANS}
    ADD COLUMN IF NOT EXISTS status ${STATUS_ENUM} NOT NULL DEFAULT 'planned',
    ADD COLUMN IF NOT EXISTS status_changed_at timestamp(3) with time zone,
    ADD COLUMN IF NOT EXISTS status_changed_by_id integer,
    ADD COLUMN IF NOT EXISTS status_reason varchar(500),
    ADD COLUMN IF NOT EXISTS started_at timestamp(3) with time zone,
    ADD COLUMN IF NOT EXISTS finished_at timestamp(3) with time zone,
    ADD COLUMN IF NOT EXISTS series_id integer,
    ADD COLUMN IF NOT EXISTS iteration_number numeric NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS previous_iteration_id integer;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE ${FLIGHT_PLANS}
      ADD CONSTRAINT ${FLIGHT_PLANS_STATUS_FK}
      FOREIGN KEY (status_changed_by_id) REFERENCES ${USERS}(id)
      ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE ${FLIGHT_PLANS}
      ADD CONSTRAINT ${FLIGHT_PLANS_SERIES_FK}
      FOREIGN KEY (series_id) REFERENCES ${FLIGHT_PLAN_SERIES}(id)
      ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE ${FLIGHT_PLANS}
      ADD CONSTRAINT ${FLIGHT_PLANS_PREVIOUS_ITERATION_FK}
      FOREIGN KEY (previous_iteration_id) REFERENCES ${FLIGHT_PLANS}(id)
      ON DELETE SET NULL ON UPDATE NO ACTION;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    DO $$ BEGIN
      ALTER TABLE ${FLIGHT_PLANS}
      ADD CONSTRAINT ${ITERATION_NUMBER_CHECK}
      CHECK (iteration_number > 0);
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLANS_STATUS_IDX}
    ON ${FLIGHT_PLANS}(status);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLANS_SERIES_IDX}
    ON ${FLIGHT_PLANS}(series_id);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${FLIGHT_PLANS_PREVIOUS_ITERATION_IDX}
    ON ${FLIGHT_PLANS}(previous_iteration_id);
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ${FLIGHT_PLANS_SERIES_ITERATION_UX}
    ON ${FLIGHT_PLANS}(series_id, iteration_number)
    WHERE series_id IS NOT NULL;
  `);

  await db.execute(sql`
    INSERT INTO ${FLIGHT_PLAN_SERIES} (slug, title, category, owner_id, created_at, updated_at)
    SELECT
      CONCAT('flight-plan-', fp.id::text, '-series') AS slug,
      COALESCE(NULLIF(fp.title, ''), CONCAT('Flight Plan ', fp.id::text)) AS title,
      COALESCE(fp.category::text, 'project')::${FLIGHT_PLAN_SERIES_CATEGORY_ENUM} AS category,
      fp.owner_id,
      COALESCE(fp.created_at, now()) AS created_at,
      COALESCE(fp.updated_at, now()) AS updated_at
    FROM ${FLIGHT_PLANS} fp
    WHERE fp.series_id IS NULL
    ON CONFLICT (slug) DO NOTHING;
  `);

  await db.execute(sql`
    UPDATE ${FLIGHT_PLANS} fp
    SET
      series_id = fps.id,
      iteration_number = COALESCE(NULLIF(fp.iteration_number, 0), 1),
      status = COALESCE(fp.status, 'planned')::${STATUS_ENUM},
      status_changed_at = COALESCE(fp.status_changed_at, fp.updated_at, fp.created_at, now())
    FROM ${FLIGHT_PLAN_SERIES} fps
    WHERE
      fp.series_id IS NULL
      AND fps.slug = CONCAT('flight-plan-', fp.id::text, '-series');
  `);

  await db.execute(sql`
    UPDATE ${FLIGHT_PLANS}
    SET
      started_at = COALESCE(
        started_at,
        CASE
          WHEN status IN ('ongoing', 'on-hold', 'postponed', 'success', 'failure', 'aborted')
          THEN COALESCE(status_changed_at, updated_at, created_at, now())
          ELSE NULL
        END
      ),
      finished_at = COALESCE(
        finished_at,
        CASE
          WHEN status IN ('success', 'failure', 'aborted', 'cancelled')
          THEN COALESCE(status_changed_at, updated_at, created_at, now())
          ELSE NULL
        END
      );
  `);

  await db.execute(sql`
    INSERT INTO ${FLIGHT_PLAN_STATUS_EVENTS}
      (flight_plan_id, from_status, to_status, reason, changed_by_id, changed_at, action_type)
    SELECT
      fp.id,
      NULL,
      fp.status::text::${STATUS_EVENT_TO_ENUM},
      ${BACKFILL_REASON},
      fp.owner_id,
      COALESCE(fp.status_changed_at, fp.updated_at, fp.created_at, now()),
      'backfill'
    FROM ${FLIGHT_PLANS} fp
    WHERE NOT EXISTS (
      SELECT 1
      FROM ${FLIGHT_PLAN_STATUS_EVENTS} ev
      WHERE ev.flight_plan_id = fp.id AND ev.action_type = 'backfill'
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLANS_SERIES_ITERATION_UX};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLANS_PREVIOUS_ITERATION_IDX};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLANS_SERIES_IDX};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLANS_STATUS_IDX};
  `);

  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLANS}
    DROP CONSTRAINT IF EXISTS ${ITERATION_NUMBER_CHECK};
  `);
  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLANS}
    DROP CONSTRAINT IF EXISTS ${FLIGHT_PLANS_PREVIOUS_ITERATION_FK};
  `);
  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLANS}
    DROP CONSTRAINT IF EXISTS ${FLIGHT_PLANS_SERIES_FK};
  `);
  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLANS}
    DROP CONSTRAINT IF EXISTS ${FLIGHT_PLANS_STATUS_FK};
  `);

  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLANS}
    DROP COLUMN IF EXISTS previous_iteration_id,
    DROP COLUMN IF EXISTS iteration_number,
    DROP COLUMN IF EXISTS series_id,
    DROP COLUMN IF EXISTS finished_at,
    DROP COLUMN IF EXISTS started_at,
    DROP COLUMN IF EXISTS status_reason,
    DROP COLUMN IF EXISTS status_changed_by_id,
    DROP COLUMN IF EXISTS status_changed_at,
    DROP COLUMN IF EXISTS status;
  `);

  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLAN_STATUS_EVENTS}
    DROP CONSTRAINT IF EXISTS ${STATUS_EVENTS_CHANGED_BY_FK};
  `);
  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLAN_STATUS_EVENTS}
    DROP CONSTRAINT IF EXISTS ${STATUS_EVENTS_FLIGHT_PLAN_FK};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLAN_STATUS_EVENTS_ACTION_IDX};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLAN_STATUS_EVENTS_CHANGED_AT_IDX};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLAN_STATUS_EVENTS_CHANGED_BY_IDX};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLAN_STATUS_EVENTS_FLIGHT_PLAN_IDX};
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS ${FLIGHT_PLAN_STATUS_EVENTS};
  `);

  await db.execute(sql`
    ALTER TABLE ${FLIGHT_PLAN_SERIES}
    DROP CONSTRAINT IF EXISTS ${sql.identifier('flight_plan_series_owner_fk')};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLAN_SERIES_CATEGORY_IDX};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLAN_SERIES_OWNER_IDX};
  `);
  await db.execute(sql`
    DROP INDEX IF EXISTS ${FLIGHT_PLAN_SERIES_SLUG_UX};
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS ${FLIGHT_PLAN_SERIES};
  `);

  await db.execute(sql`
    DROP TYPE IF EXISTS ${STATUS_EVENT_ACTION_ENUM};
  `);

  await db.execute(sql`
    DROP TYPE IF EXISTS ${STATUS_EVENT_TO_ENUM};
  `);

  await db.execute(sql`
    DROP TYPE IF EXISTS ${STATUS_EVENT_FROM_ENUM};
  `);

  await db.execute(sql`
    DROP TYPE IF EXISTS ${FLIGHT_PLAN_SERIES_CATEGORY_ENUM};
  `);

  await db.execute(sql`
    DROP TYPE IF EXISTS ${STATUS_ENUM};
  `);
}
