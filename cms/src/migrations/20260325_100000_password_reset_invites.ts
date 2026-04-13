import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const USERS_TABLE = sql.raw(`"public"."users"`);
const TOKENS_TABLE = sql.raw(`"public"."registration_tokens"`);

const TARGET_USER_INDEX = sql.raw(`"users_invite_invite_target_user_idx"`);
const TOKEN_TARGET_INDEX = sql.raw(`"registration_tokens_target_user_idx"`);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
      ADD COLUMN IF NOT EXISTS "invite_purpose" varchar,
      ADD COLUMN IF NOT EXISTS "invite_target_user_id" integer REFERENCES ${USERS_TABLE}("id") ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS "invite_call_sign_snapshot" varchar,
      ADD COLUMN IF NOT EXISTS "invite_profile_slug_snapshot" varchar,
      ADD COLUMN IF NOT EXISTS "invite_link_hidden" boolean DEFAULT true;
  `);

  await db.execute(sql`
    UPDATE ${USERS_TABLE}
    SET
      "invite_purpose" = COALESCE("invite_purpose", 'recruit'),
      "invite_link_hidden" = true
    WHERE "invite_email" IS NOT NULL;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${TARGET_USER_INDEX}
      ON ${USERS_TABLE} ("invite_target_user_id");
  `);

  await db.execute(sql`
    ALTER TABLE ${TOKENS_TABLE}
      ADD COLUMN IF NOT EXISTS "purpose" varchar DEFAULT 'recruit'::varchar NOT NULL,
      ADD COLUMN IF NOT EXISTS "target_user_id" integer REFERENCES ${USERS_TABLE}("id") ON DELETE SET NULL;
  `);

  await db.execute(sql`
    UPDATE ${TOKENS_TABLE}
    SET "purpose" = COALESCE("purpose", 'recruit');
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${TOKEN_TARGET_INDEX}
      ON ${TOKENS_TABLE} ("target_user_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS ${TARGET_USER_INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${USERS_TABLE}
      DROP COLUMN IF EXISTS "invite_purpose",
      DROP COLUMN IF EXISTS "invite_target_user_id",
      DROP COLUMN IF EXISTS "invite_call_sign_snapshot",
      DROP COLUMN IF EXISTS "invite_profile_slug_snapshot",
      DROP COLUMN IF EXISTS "invite_link_hidden";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${TOKEN_TARGET_INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${TOKENS_TABLE}
      DROP COLUMN IF EXISTS "purpose",
      DROP COLUMN IF EXISTS "target_user_id";
  `);
}
