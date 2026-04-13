import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const RELS_TABLE = sql.raw('"payload_locked_documents_rels"');
const GALLERY_TABLE = sql.raw('"gallery_images"');
const COLUMN = '"gallery_images_id"';
const INDEX = sql.identifier('payload_locked_documents_rels_gallery_images_id_idx');
const FK_NAME = sql.identifier('payload_locked_documents_rels_gallery_images_fk');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${RELS_TABLE}
    ADD COLUMN IF NOT EXISTS ${sql.raw(COLUMN)} integer;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${INDEX}
    ON ${RELS_TABLE} (${sql.raw(COLUMN)});
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${RELS_TABLE}
      ADD CONSTRAINT ${FK_NAME}
      FOREIGN KEY (${sql.raw(COLUMN)}) REFERENCES ${GALLERY_TABLE}("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${RELS_TABLE}
    DROP CONSTRAINT IF EXISTS ${FK_NAME};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${RELS_TABLE}
    DROP COLUMN IF EXISTS ${sql.raw(COLUMN)};
  `);
}
