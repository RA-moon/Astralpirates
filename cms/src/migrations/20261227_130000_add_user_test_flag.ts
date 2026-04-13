import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const USERS_TABLE = sql.raw('"public"."users"');
const USERS_IS_TEST_USER_INDEX = sql.raw('"users_is_test_user_idx"');
const USERS_ACCOUNT_TYPE_INDEX = sql.raw('"users_account_type_idx"');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    ADD COLUMN IF NOT EXISTS "is_test_user" boolean DEFAULT false;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${USERS_IS_TEST_USER_INDEX}
    ON ${USERS_TABLE} ("is_test_user");
  `);

  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    ADD COLUMN IF NOT EXISTS "account_type" varchar DEFAULT 'human';
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${USERS_ACCOUNT_TYPE_INDEX}
    ON ${USERS_TABLE} ("account_type");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS ${USERS_ACCOUNT_TYPE_INDEX};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${USERS_IS_TEST_USER_INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    DROP COLUMN IF EXISTS "account_type";
  `);

  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    DROP COLUMN IF EXISTS "is_test_user";
  `);
}
