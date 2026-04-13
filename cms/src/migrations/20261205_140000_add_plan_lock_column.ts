import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const LOCKED_RELS_TABLE = sql.raw('"public"."payload_locked_documents_rels"');
const PLANS_TABLE = sql.raw('"public"."plans"');
const LOCKED_COLUMN = '"plans_id"';
const LOCKED_INDEX = sql.identifier('payload_locked_documents_rels_plans_id_idx');
const LOCKED_FK = sql.identifier('payload_locked_documents_rels_plans_fk');

export async function up({ db }: MigrateUpArgs): Promise<void> {
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
      FOREIGN KEY (${sql.raw(LOCKED_COLUMN)}) REFERENCES ${PLANS_TABLE}("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
    DROP CONSTRAINT IF EXISTS ${LOCKED_FK};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${LOCKED_INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
    DROP COLUMN IF EXISTS ${sql.raw(LOCKED_COLUMN)};
  `);
}
