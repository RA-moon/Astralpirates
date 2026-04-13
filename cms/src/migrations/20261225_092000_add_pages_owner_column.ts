import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const PAGES_TABLE = sql.raw('"public"."pages"');
const USERS_TABLE = sql.raw('"public"."users"');
const OWNER_COLUMN = sql.raw('"owner_id"');
const OWNER_INDEX = sql.identifier('pages_owner_idx');
const OWNER_FK = sql.identifier('pages_owner_fk');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${PAGES_TABLE}
    ADD COLUMN IF NOT EXISTS ${OWNER_COLUMN} integer;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${OWNER_INDEX}
    ON ${PAGES_TABLE} (${OWNER_COLUMN});
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${PAGES_TABLE}
      ADD CONSTRAINT ${OWNER_FK}
      FOREIGN KEY (${OWNER_COLUMN}) REFERENCES ${USERS_TABLE}("id") ON DELETE SET NULL;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${PAGES_TABLE}
    DROP CONSTRAINT IF EXISTS ${OWNER_FK};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${OWNER_INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${PAGES_TABLE}
    DROP COLUMN IF EXISTS ${OWNER_COLUMN};
  `);
}
