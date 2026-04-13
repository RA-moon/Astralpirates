import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const PROFILE_SLUG_REDIRECTS_TABLE = sql.raw('"public"."profile_slug_redirects"');
const PROFILE_SLUG_REDIRECTS_IDX_FROM_SLUG = sql.raw('"profile_slug_redirects_from_slug_uq"');

const ensurePgCrypto = sql.raw('"pgcrypto"');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS ${ensurePgCrypto};`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${PROFILE_SLUG_REDIRECTS_TABLE} (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      from_slug text NOT NULL,
      to_slug text NOT NULL,
      target_user_id integer NOT NULL,
      reason text NOT NULL DEFAULT 'profile-rename',
      created_at timestamptz NOT NULL DEFAULT now(),
      disabled_at timestamptz
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ${PROFILE_SLUG_REDIRECTS_IDX_FROM_SLUG}
      ON ${PROFILE_SLUG_REDIRECTS_TABLE} (from_slug)
      WHERE disabled_at IS NULL;

    ALTER TABLE ${PROFILE_SLUG_REDIRECTS_TABLE}
      ADD CONSTRAINT profile_slug_redirects_target_user_id_fkey
      FOREIGN KEY (target_user_id)
      REFERENCES users(id)
      ON DELETE CASCADE;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${PROFILE_SLUG_REDIRECTS_TABLE}
      DROP CONSTRAINT IF EXISTS profile_slug_redirects_target_user_id_fkey;

    DROP INDEX IF EXISTS ${PROFILE_SLUG_REDIRECTS_IDX_FROM_SLUG};
    DROP TABLE IF EXISTS ${PROFILE_SLUG_REDIRECTS_TABLE};
  `);
}

