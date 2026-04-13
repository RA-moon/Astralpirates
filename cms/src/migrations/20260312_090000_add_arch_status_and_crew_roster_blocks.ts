import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const enumDefinitions = [
  {
    name: 'enum_pages_blocks_arch_status_overview_ctas_style',
    values: ['primary', 'secondary', 'link'] as const,
  },
  {
    name: 'enum_pages_blocks_arch_status_checklist_tasks_metric',
    values: ['logs', 'flightPlans', 'combined'] as const,
  },
  {
    name: 'enum_pages_blocks_crew_roster_ctas_style',
    values: ['primary', 'secondary', 'link'] as const,
  },
  {
    name: 'enum_pages_blocks_crew_roster_mode',
    values: ['full', 'preview'] as const,
  },
] as const;

const buildEnsureEnumStatement = (name: string, values: readonly string[]) => {
  const escapedValues = values.map((value) => value.replace(/'/g, "''"));
  return `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = '${name}'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE "public"."${name}" AS ENUM (${escapedValues.map((value) => `'${value}'`).join(', ')});
  END IF;
END
$$;
`;
};

const ARCH_STATUS_OVERVIEW_TABLE = sql.raw('"pages_blocks_arch_status_overview"');
const ARCH_STATUS_OVERVIEW_CTAS_TABLE = sql.raw('"pages_blocks_arch_status_overview_ctas"');
const ARCH_STATUS_CHECKLIST_TABLE = sql.raw('"pages_blocks_arch_status_checklist"');
const ARCH_STATUS_CHECKLIST_TASKS_TABLE = sql.raw('"pages_blocks_arch_status_checklist_tasks"');
const CREW_ROSTER_TABLE = sql.raw('"pages_blocks_crew_roster"');
const CREW_ROSTER_CTAS_TABLE = sql.raw('"pages_blocks_crew_roster_ctas"');

const ARCH_STATUS_OVERVIEW_ORDER_IDX = sql.raw('"pages_blocks_arch_status_overview_order_idx"');
const ARCH_STATUS_OVERVIEW_PARENT_IDX = sql.raw('"pages_blocks_arch_status_overview_parent_id_idx"');
const ARCH_STATUS_OVERVIEW_PATH_IDX = sql.raw('"pages_blocks_arch_status_overview_path_idx"');
const ARCH_STATUS_OVERVIEW_CTAS_ORDER_IDX = sql.raw('"pages_blocks_arch_status_overview_ctas_order_idx"');
const ARCH_STATUS_OVERVIEW_CTAS_PARENT_IDX = sql.raw('"pages_blocks_arch_status_overview_ctas_parent_id_idx"');

const ARCH_STATUS_CHECKLIST_ORDER_IDX = sql.raw('"pages_blocks_arch_status_checklist_order_idx"');
const ARCH_STATUS_CHECKLIST_PARENT_IDX = sql.raw('"pages_blocks_arch_status_checklist_parent_id_idx"');
const ARCH_STATUS_CHECKLIST_PATH_IDX = sql.raw('"pages_blocks_arch_status_checklist_path_idx"');
const ARCH_STATUS_CHECKLIST_TASKS_ORDER_IDX = sql.raw('"pages_blocks_arch_status_checklist_tasks_order_idx"');
const ARCH_STATUS_CHECKLIST_TASKS_PARENT_IDX = sql.raw('"pages_blocks_arch_status_checklist_tasks_parent_id_idx"');

const CREW_ROSTER_ORDER_IDX = sql.raw('"pages_blocks_crew_roster_order_idx"');
const CREW_ROSTER_PARENT_IDX = sql.raw('"pages_blocks_crew_roster_parent_id_idx"');
const CREW_ROSTER_PATH_IDX = sql.raw('"pages_blocks_crew_roster_path_idx"');
const CREW_ROSTER_CTAS_ORDER_IDX = sql.raw('"pages_blocks_crew_roster_ctas_order_idx"');
const CREW_ROSTER_CTAS_PARENT_IDX = sql.raw('"pages_blocks_crew_roster_ctas_parent_id_idx"');

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const definition of enumDefinitions) {
    await db.execute(sql.raw(buildEnsureEnumStatement(definition.name, definition.values)));
  }

  await db.execute(sql`
    DROP TABLE IF EXISTS ${CREW_ROSTER_CTAS_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${CREW_ROSTER_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${ARCH_STATUS_CHECKLIST_TASKS_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${ARCH_STATUS_CHECKLIST_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${ARCH_STATUS_OVERVIEW_CTAS_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${ARCH_STATUS_OVERVIEW_TABLE} CASCADE;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${ARCH_STATUS_OVERVIEW_TABLE} (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar NOT NULL PRIMARY KEY,
      "badge" varchar,
      "title" varchar NOT NULL,
      "tagline" jsonb,
      "meta_label" varchar DEFAULT 'Arch build is',
      "logs_label" varchar DEFAULT 'bridge dispatches',
      "plans_label" varchar DEFAULT 'mission plans',
      "block_name" varchar,
      CONSTRAINT "pages_blocks_arch_status_overview_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "pages"("id") ON DELETE CASCADE
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${ARCH_STATUS_OVERVIEW_ORDER_IDX} ON ${ARCH_STATUS_OVERVIEW_TABLE} ("_order");
    CREATE INDEX IF NOT EXISTS ${ARCH_STATUS_OVERVIEW_PARENT_IDX} ON ${ARCH_STATUS_OVERVIEW_TABLE} ("_parent_id");
    CREATE INDEX IF NOT EXISTS ${ARCH_STATUS_OVERVIEW_PATH_IDX} ON ${ARCH_STATUS_OVERVIEW_TABLE} ("_path");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${ARCH_STATUS_OVERVIEW_CTAS_TABLE} (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar NOT NULL PRIMARY KEY,
      "label" varchar NOT NULL,
      "href" varchar NOT NULL,
      "style" "public"."enum_pages_blocks_arch_status_overview_ctas_style" DEFAULT 'primary',
      CONSTRAINT "pages_blocks_arch_status_overview_ctas_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES ${ARCH_STATUS_OVERVIEW_TABLE}("id") ON DELETE CASCADE
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${ARCH_STATUS_OVERVIEW_CTAS_ORDER_IDX} ON ${ARCH_STATUS_OVERVIEW_CTAS_TABLE} ("_order");
    CREATE INDEX IF NOT EXISTS ${ARCH_STATUS_OVERVIEW_CTAS_PARENT_IDX} ON ${ARCH_STATUS_OVERVIEW_CTAS_TABLE} ("_parent_id");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${ARCH_STATUS_CHECKLIST_TABLE} (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar NOT NULL PRIMARY KEY,
      "title" varchar NOT NULL,
      "intro" jsonb,
      "block_name" varchar,
      CONSTRAINT "pages_blocks_arch_status_checklist_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "pages"("id") ON DELETE CASCADE
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${ARCH_STATUS_CHECKLIST_ORDER_IDX} ON ${ARCH_STATUS_CHECKLIST_TABLE} ("_order");
    CREATE INDEX IF NOT EXISTS ${ARCH_STATUS_CHECKLIST_PARENT_IDX} ON ${ARCH_STATUS_CHECKLIST_TABLE} ("_parent_id");
    CREATE INDEX IF NOT EXISTS ${ARCH_STATUS_CHECKLIST_PATH_IDX} ON ${ARCH_STATUS_CHECKLIST_TABLE} ("_path");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${ARCH_STATUS_CHECKLIST_TASKS_TABLE} (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar NOT NULL PRIMARY KEY,
      "label" varchar NOT NULL,
      "description" jsonb,
      "metric" "public"."enum_pages_blocks_arch_status_checklist_tasks_metric" NOT NULL DEFAULT 'combined',
      "progress_threshold" numeric NOT NULL DEFAULT 4,
      "done_threshold" numeric NOT NULL DEFAULT 8,
      CONSTRAINT "pages_blocks_arch_status_checklist_tasks_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES ${ARCH_STATUS_CHECKLIST_TABLE}("id") ON DELETE CASCADE
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${ARCH_STATUS_CHECKLIST_TASKS_ORDER_IDX} ON ${ARCH_STATUS_CHECKLIST_TASKS_TABLE} ("_order");
    CREATE INDEX IF NOT EXISTS ${ARCH_STATUS_CHECKLIST_TASKS_PARENT_IDX} ON ${ARCH_STATUS_CHECKLIST_TASKS_TABLE} ("_parent_id");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${CREW_ROSTER_TABLE} (
      "_order" integer NOT NULL,
      "_parent_id" integer NOT NULL,
      "_path" text NOT NULL,
      "id" varchar NOT NULL PRIMARY KEY,
      "badge" varchar,
      "title" varchar NOT NULL,
      "description" jsonb,
      "mode" "public"."enum_pages_blocks_crew_roster_mode" DEFAULT 'full',
      "limit" numeric,
      "block_name" varchar,
      CONSTRAINT "pages_blocks_crew_roster_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES "pages"("id") ON DELETE CASCADE
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${CREW_ROSTER_ORDER_IDX} ON ${CREW_ROSTER_TABLE} ("_order");
    CREATE INDEX IF NOT EXISTS ${CREW_ROSTER_PARENT_IDX} ON ${CREW_ROSTER_TABLE} ("_parent_id");
    CREATE INDEX IF NOT EXISTS ${CREW_ROSTER_PATH_IDX} ON ${CREW_ROSTER_TABLE} ("_path");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${CREW_ROSTER_CTAS_TABLE} (
      "_order" integer NOT NULL,
      "_parent_id" varchar NOT NULL,
      "id" varchar NOT NULL PRIMARY KEY,
      "label" varchar NOT NULL,
      "href" varchar NOT NULL,
      "style" "public"."enum_pages_blocks_crew_roster_ctas_style" DEFAULT 'primary',
      CONSTRAINT "pages_blocks_crew_roster_ctas_parent_id_fk"
        FOREIGN KEY ("_parent_id") REFERENCES ${CREW_ROSTER_TABLE}("id") ON DELETE CASCADE
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS ${CREW_ROSTER_CTAS_ORDER_IDX} ON ${CREW_ROSTER_CTAS_TABLE} ("_order");
    CREATE INDEX IF NOT EXISTS ${CREW_ROSTER_CTAS_PARENT_IDX} ON ${CREW_ROSTER_CTAS_TABLE} ("_parent_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS ${CREW_ROSTER_CTAS_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${CREW_ROSTER_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${ARCH_STATUS_CHECKLIST_TASKS_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${ARCH_STATUS_CHECKLIST_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${ARCH_STATUS_OVERVIEW_CTAS_TABLE} CASCADE;
    DROP TABLE IF EXISTS ${ARCH_STATUS_OVERVIEW_TABLE} CASCADE;
  `);

  for (const definition of enumDefinitions) {
    await db.execute(
      sql.raw(`DROP TYPE IF EXISTS "public"."${definition.name}";`),
    );
  }
}
