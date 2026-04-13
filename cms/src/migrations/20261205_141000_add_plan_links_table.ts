import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const PLANS_TABLE = sql.raw('"public"."plans"');
const PLAN_LINKS_TABLE = sql.raw('"public"."plans_links"');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${PLAN_LINKS_TABLE} (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" serial PRIMARY KEY,
      "label" varchar,
      "url" varchar
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "plans_links_order_idx"
    ON ${PLAN_LINKS_TABLE} ("_order");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "plans_links_parent_id_idx"
    ON ${PLAN_LINKS_TABLE} ("_parent_id");
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${PLAN_LINKS_TABLE}
      ADD CONSTRAINT "plans_links_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES ${PLANS_TABLE}("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS ${PLAN_LINKS_TABLE};
  `);
}
