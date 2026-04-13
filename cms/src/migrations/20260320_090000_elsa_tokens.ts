import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const USERS_TABLE = sql.raw(`"public"."users"`);
const COLUMN_CHECK = sql`
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'users'
    AND column_name = 'elsa'
  LIMIT 1
`;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (${COLUMN_CHECK}) THEN
        ALTER TABLE ${USERS_TABLE}
        RENAME COLUMN "elsa" TO "elsa_tokens";
      END IF;
    END $$;
  `);

  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    ALTER COLUMN "elsa_tokens" SET DEFAULT 0;
  `);

  await db.execute(sql`
    UPDATE ${USERS_TABLE}
    SET "elsa_tokens" = GREATEST(0, COALESCE("elsa_tokens", 0));
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    ALTER COLUMN "elsa_tokens" SET DEFAULT NULL;
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'elsa_tokens'
      ) THEN
        ALTER TABLE ${USERS_TABLE}
        RENAME COLUMN "elsa_tokens" TO "elsa";
      END IF;
    END $$;
  `);

  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
    ALTER COLUMN "elsa" SET DEFAULT 1;
  `);
}
