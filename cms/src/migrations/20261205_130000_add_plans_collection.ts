import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const PLANS_TABLE = sql.raw('"public"."plans"');

const enumIdentifier = (name: string) => `"public"."${name}"`;
const enumLiteral = (name: string) => `'${name}'`;

const PLAN_ENUMS = [
  { name: 'enum_plans_status', values: ['queued', 'active', 'shipped', 'tested'] },
  { name: 'enum_plans_cloud_status', values: ['pending', 'deploying', 'healthy'] },
];

const ROADMAP_STATUS_ENUMS = [
  'enum_roadmap_tiers_items_status',
  'enum_roadmap_tiers_items_plan_status',
];

const createEnum = async (db: MigrateUpArgs['db'], name: string, values: string[]) => {
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

const dropEnum = async (db: MigrateDownArgs['db'], name: string) => {
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
  for (const spec of PLAN_ENUMS) {
    await createEnum(db, spec.name, spec.values);
  }

  for (const name of ROADMAP_STATUS_ENUMS) {
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
            ALTER TYPE ${enumIdentifier(name)} ADD VALUE IF NOT EXISTS 'tested';
          END IF;
        END
        $$;
      `),
    );
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${PLANS_TABLE} (
      "id" serial PRIMARY KEY,
      "plan_id" varchar NOT NULL,
      "slug" varchar NOT NULL,
      "title" varchar NOT NULL,
      "owner" varchar,
      "tier" varchar,
      "status" ${sql.raw(enumIdentifier('enum_plans_status'))} NOT NULL DEFAULT 'queued',
      "cloud_status" ${sql.raw(enumIdentifier('enum_plans_cloud_status'))} NOT NULL DEFAULT 'pending',
      "summary" varchar,
      "last_updated" varchar,
      "path" varchar,
      "links" jsonb,
      "body" jsonb,
      "updated_at" timestamptz(3) NOT NULL DEFAULT now(),
      "created_at" timestamptz(3) NOT NULL DEFAULT now()
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "plans_plan_id_idx" ON ${PLANS_TABLE} ("plan_id");
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "plans_slug_idx" ON ${PLANS_TABLE} ("slug");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "plans_updated_at_idx" ON ${PLANS_TABLE} ("updated_at");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "plans_created_at_idx" ON ${PLANS_TABLE} ("created_at");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS ${PLANS_TABLE};
  `);

  for (const spec of [...PLAN_ENUMS].reverse()) {
    await dropEnum(db, spec.name);
  }
  // Note: enum value "tested" on roadmap enums is not removed on down, as PostgreSQL enums
  // do not support dropping values safely.
}
