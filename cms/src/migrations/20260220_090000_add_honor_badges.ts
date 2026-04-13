import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const SOURCE_ENUM = '"public"."enum_users_honor_badges_source"';
const TABLE_NAME = '"public"."users_honor_badges"';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_users_honor_badges_source'
          AND n.nspname = 'public'
      ) THEN
        CREATE TYPE ${sql.raw(SOURCE_ENUM)} AS ENUM ('automatic', 'manual');
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.raw(TABLE_NAME)} (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY NOT NULL,
      "code" varchar NOT NULL,
      "awarded_at" timestamptz NOT NULL DEFAULT NOW(),
      "source" ${sql.raw(SOURCE_ENUM)} NOT NULL DEFAULT 'automatic',
      "note" text
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "users_honor_badges_order_idx" ON ${sql.raw(TABLE_NAME)} USING btree ("_order");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "users_honor_badges_parent_id_idx" ON ${sql.raw(TABLE_NAME)} USING btree ("_parent_id");
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        WHERE c.conname = 'users_honor_badges_parent_id_fk'
      ) THEN
        ALTER TABLE ${sql.raw(TABLE_NAME)}
        ADD CONSTRAINT "users_honor_badges_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;
      END IF;
    END
    $$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS ${sql.raw(TABLE_NAME)} CASCADE;`);
  await db.execute(sql`DROP TYPE IF EXISTS ${sql.raw(SOURCE_ENUM)};`);
}
