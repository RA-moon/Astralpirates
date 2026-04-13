import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const FLIGHT_PLANS_TABLE = sql.raw('"flight_plans"');
const GALLERY_TABLE = sql.raw('"flight_plans_gallery_slides"');
const GALLERY_PARENT_IDX = sql.identifier('flight_plans_gallery_slides_parent_id_idx');
const GALLERY_ORDER_IDX = sql.identifier('flight_plans_gallery_slides_order_idx');
const GALLERY_PARENT_FK = sql.identifier('flight_plans_gallery_slides_parent_id_fk');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${GALLERY_TABLE} (
      "id" varchar PRIMARY KEY,
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "label" varchar,
      "image_url" varchar NOT NULL,
      "image_alt" varchar NOT NULL,
      "caption" varchar,
      "credit_label" varchar,
      "credit_url" varchar
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${GALLERY_ORDER_IDX}
    ON ${GALLERY_TABLE} ("_order");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${GALLERY_PARENT_IDX}
    ON ${GALLERY_TABLE} ("_parent_id");
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${GALLERY_TABLE}
      ADD CONSTRAINT ${GALLERY_PARENT_FK}
      FOREIGN KEY ("_parent_id") REFERENCES ${FLIGHT_PLANS_TABLE}("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${GALLERY_TABLE}
    DROP CONSTRAINT IF EXISTS ${GALLERY_PARENT_FK};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${GALLERY_PARENT_IDX};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${GALLERY_ORDER_IDX};
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS ${GALLERY_TABLE};
  `);
}
