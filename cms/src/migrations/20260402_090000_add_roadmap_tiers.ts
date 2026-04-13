import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const ROADMAP_TIERS_TABLE = sql.raw('"public"."roadmap_tiers"');
const ROADMAP_ITEMS_TABLE = sql.raw('"public"."roadmap_tiers_items"');
const LOCKED_RELS_TABLE = sql.raw('"public"."payload_locked_documents_rels"');

const LOCKED_COLUMN = '"roadmap_tiers_id"';
const LOCKED_INDEX = sql.identifier('payload_locked_documents_rels_roadmap_tiers_id_idx');
const LOCKED_FK = sql.identifier('payload_locked_documents_rels_roadmap_tiers_fk');

type EnumSpec = {
  name: string;
  values: string[];
};

const ENUMS: EnumSpec[] = [
  { name: 'enum_roadmap_tiers_items_status', values: ['queued', 'active', 'shipped'] },
  { name: 'enum_roadmap_tiers_items_cloud_status', values: ['pending', 'deploying', 'healthy'] },
  { name: 'enum_roadmap_tiers_items_plan_status', values: ['queued', 'active', 'shipped'] },
  { name: 'enum_roadmap_tiers_items_plan_cloud_status', values: ['pending', 'deploying', 'healthy'] },
  { name: 'enum_roadmap_tiers_tier', values: ['tier1', 'tier2', 'tier3'] },
];

const enumIdentifier = (name: string) => `"public"."${name}"`;
const enumLiteral = (name: string) => `'${name}'`;

const createEnum = async (db: MigrateUpArgs['db'], { name, values }: EnumSpec) => {
  const valueList = values.map((value) => `'${value}'`).join(', ');
  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = ${enumLiteral(name)} AND n.nspname = 'public'
        ) THEN
          CREATE TYPE ${enumIdentifier(name)} AS ENUM (${valueList});
        END IF;
      END
      $$;
    `),
  );
};

const dropEnum = async (db: MigrateDownArgs['db'], { name }: EnumSpec) => {
  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = ${enumLiteral(name)} AND n.nspname = 'public'
        ) THEN
          DROP TYPE ${enumIdentifier(name)};
        END IF;
      END
      $$;
    `),
  );
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const spec of ENUMS) {
    await createEnum(db, spec);
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${ROADMAP_TIERS_TABLE} (
      "id" serial PRIMARY KEY,
      "tier_id" varchar NOT NULL,
      "tier" ${sql.raw(enumIdentifier('enum_roadmap_tiers_tier'))} NOT NULL,
      "title" varchar NOT NULL,
      "description" varchar,
      "focus" varchar,
      "status_summary" varchar,
      "updated_at" timestamptz(3) NOT NULL DEFAULT now(),
      "created_at" timestamptz(3) NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "roadmap_tiers_tier_id_idx"
    ON ${ROADMAP_TIERS_TABLE} ("tier_id");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "roadmap_tiers_updated_at_idx"
    ON ${ROADMAP_TIERS_TABLE} ("updated_at");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "roadmap_tiers_created_at_idx"
    ON ${ROADMAP_TIERS_TABLE} ("created_at");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${ROADMAP_ITEMS_TABLE} (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "id" varchar PRIMARY KEY,
      "code" varchar NOT NULL,
      "title" varchar NOT NULL,
      "summary" varchar,
      "status" ${sql.raw(enumIdentifier('enum_roadmap_tiers_items_status'))} NOT NULL DEFAULT 'queued',
      "cloud_status" ${sql.raw(enumIdentifier('enum_roadmap_tiers_items_cloud_status'))} NOT NULL DEFAULT 'pending',
      "reference_label" varchar,
      "reference_url" varchar,
      "plan_title" varchar,
      "plan_owner" varchar,
      "plan_path" varchar,
      "plan_status" ${sql.raw(enumIdentifier('enum_roadmap_tiers_items_plan_status'))},
      "plan_cloud_status" ${sql.raw(enumIdentifier('enum_roadmap_tiers_items_plan_cloud_status'))}
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "roadmap_tiers_items_order_idx"
    ON ${ROADMAP_ITEMS_TABLE} ("_order");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "roadmap_tiers_items_parent_id_idx"
    ON ${ROADMAP_ITEMS_TABLE} ("_parent_id");
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${ROADMAP_ITEMS_TABLE}
      ADD CONSTRAINT "roadmap_tiers_items_parent_id_fk"
      FOREIGN KEY ("_parent_id") REFERENCES ${ROADMAP_TIERS_TABLE}("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);

  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
    ADD COLUMN IF NOT EXISTS ${sql.raw(LOCKED_COLUMN)} integer;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${LOCKED_INDEX}
    ON ${LOCKED_RELS_TABLE} (${sql.raw(LOCKED_COLUMN)});
  `);

  await db.execute(sql`
    DO $$BEGIN
      ALTER TABLE ${LOCKED_RELS_TABLE}
      ADD CONSTRAINT ${LOCKED_FK}
      FOREIGN KEY (${sql.raw(LOCKED_COLUMN)}) REFERENCES ${ROADMAP_TIERS_TABLE}("id") ON DELETE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END$$;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
    DROP CONSTRAINT IF EXISTS ${LOCKED_FK};
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS ${LOCKED_INDEX};
  `);

  await db.execute(sql`
    ALTER TABLE ${LOCKED_RELS_TABLE}
    DROP COLUMN IF EXISTS ${sql.raw(LOCKED_COLUMN)};
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS ${ROADMAP_ITEMS_TABLE};
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS ${ROADMAP_TIERS_TABLE};
  `);

  for (const spec of [...ENUMS].reverse()) {
    await dropEnum(db, spec);
  }
}
