import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const LOGS_TABLE = sql.raw('"logs"');
const RELS_TABLE = sql.raw('"payload_locked_documents_rels"');
const NOTIFICATIONS_TABLE = sql.raw('"notifications"');
const USERS_TABLE = sql.raw('"users"');
const NOTIFICATIONS_INDEX = sql.identifier('payload_locked_documents_rels_notifications_id_idx');
const NOTIFICATIONS_FK = sql.identifier('payload_locked_documents_rels_notifications_fk');
const NOTIFICATIONS_RECIPIENT_IDX = sql.identifier('notifications_recipient_idx');
const NOTIFICATIONS_ACTOR_IDX = sql.identifier('notifications_actor_idx');
const NOTIFICATIONS_UPDATED_IDX = sql.identifier('notifications_updated_at_idx');
const NOTIFICATIONS_CREATED_IDX = sql.identifier('notifications_created_at_idx');
const NOTIFICATIONS_RECIPIENT_FK = sql.identifier('notifications_recipient_fk');
const NOTIFICATIONS_ACTOR_FK = sql.identifier('notifications_actor_fk');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${LOGS_TABLE}
    ADD COLUMN IF NOT EXISTS "headline" varchar NOT NULL DEFAULT 'Log entry';
  `);

  await db.execute(sql`
    UPDATE ${LOGS_TABLE}
    SET "headline" = COALESCE(
      NULLIF(
        btrim(substring("title" FROM '\"([^"]+)\"')),
        ''
      ),
      NULLIF(
        btrim(substring("title" FROM 'Log\\s+[0-9]{14}\\s+\"?([^"]+)\"?')),
        ''
      ),
      "headline"
    );
  `);

  await db.execute(sql`
    ALTER TABLE ${LOGS_TABLE}
    ALTER COLUMN "headline" DROP DEFAULT;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${NOTIFICATIONS_TABLE} (
      "id" serial PRIMARY KEY,
      "event" varchar NOT NULL,
      "recipient_id" integer NOT NULL,
      "actor_id" integer,
      "message" varchar NOT NULL,
      "cta_url" varchar,
      "cta_label" varchar,
      "metadata" jsonb,
      "read_at" timestamptz(3),
      "updated_at" timestamptz(3) NOT NULL DEFAULT NOW(),
      "created_at" timestamptz(3) NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${NOTIFICATIONS_RECIPIENT_IDX}
    ON ${NOTIFICATIONS_TABLE} ("recipient_id");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${NOTIFICATIONS_ACTOR_IDX}
    ON ${NOTIFICATIONS_TABLE} ("actor_id");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${NOTIFICATIONS_UPDATED_IDX}
    ON ${NOTIFICATIONS_TABLE} ("updated_at");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${NOTIFICATIONS_CREATED_IDX}
    ON ${NOTIFICATIONS_TABLE} ("created_at");
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${NOTIFICATIONS_TABLE}
      ADD CONSTRAINT ${NOTIFICATIONS_RECIPIENT_FK}
      FOREIGN KEY ("recipient_id") REFERENCES ${USERS_TABLE}("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${NOTIFICATIONS_TABLE}
      ADD CONSTRAINT ${NOTIFICATIONS_ACTOR_FK}
      FOREIGN KEY ("actor_id") REFERENCES ${USERS_TABLE}("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    ALTER TABLE ${RELS_TABLE}
    ADD COLUMN IF NOT EXISTS "notifications_id" integer;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${NOTIFICATIONS_INDEX}
    ON ${RELS_TABLE} ("notifications_id");
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${RELS_TABLE}
      ADD CONSTRAINT ${NOTIFICATIONS_FK}
      FOREIGN KEY ("notifications_id") REFERENCES ${NOTIFICATIONS_TABLE}("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${RELS_TABLE}
    DROP CONSTRAINT IF EXISTS ${NOTIFICATIONS_FK};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${NOTIFICATIONS_INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${RELS_TABLE}
    DROP COLUMN IF EXISTS "notifications_id";
  `);

  await db.execute(sql`
    ALTER TABLE ${NOTIFICATIONS_TABLE}
    DROP CONSTRAINT IF EXISTS ${NOTIFICATIONS_RECIPIENT_FK};
  `);

  await db.execute(sql`
    ALTER TABLE ${NOTIFICATIONS_TABLE}
    DROP CONSTRAINT IF EXISTS ${NOTIFICATIONS_ACTOR_FK};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${NOTIFICATIONS_RECIPIENT_IDX};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${NOTIFICATIONS_ACTOR_IDX};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${NOTIFICATIONS_UPDATED_IDX};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${NOTIFICATIONS_CREATED_IDX};
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS ${NOTIFICATIONS_TABLE};
  `);

  await db.execute(sql`
    ALTER TABLE ${LOGS_TABLE}
    DROP COLUMN IF EXISTS "headline";
  `);
}
