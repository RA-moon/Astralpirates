import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TABLE = sql.identifier('pages_blocks_navigation_module');
const ORDER_INDEX = sql.identifier('pages_blocks_navigation_module_order_idx');
const PARENT_INDEX = sql.identifier('pages_blocks_navigation_module_parent_id_idx');
const PATH_INDEX = sql.identifier('pages_blocks_navigation_module_path_idx');

// Safety migration to ensure the navigation module block table exists for seeds
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar NOT NULL PRIMARY KEY,
      "title" varchar,
      "description" jsonb,
      "node_id" varchar,
      "path" varchar,
      "block_name" varchar,
      CONSTRAINT "pages_blocks_navigation_module_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "pages"("id") ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS ${ORDER_INDEX} ON ${TABLE} ("_order");
    CREATE INDEX IF NOT EXISTS ${PARENT_INDEX} ON ${TABLE} ("_parent_id");
    CREATE INDEX IF NOT EXISTS ${PATH_INDEX} ON ${TABLE} ("_path");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS ${TABLE};
  `);
}
