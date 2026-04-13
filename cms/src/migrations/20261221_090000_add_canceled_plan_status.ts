import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const enumIdentifier = (name: string) => `"public"."${name}"`;
const enumLiteral = (name: string) => `'${name}'`;

const ROADMAP_STATUS_ENUMS = [
  'enum_roadmap_tiers_items_status',
  'enum_roadmap_tiers_items_plan_status',
];

const addEnumValueIfExists = async (db: MigrateUpArgs['db'], name: string, value: string) => {
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
          ALTER TYPE ${enumIdentifier(name)} ADD VALUE IF NOT EXISTS '${value}';
        END IF;
      END
      $$;
    `),
  );
};

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await addEnumValueIfExists(db, 'enum_plans_status', 'canceled');

  for (const name of ROADMAP_STATUS_ENUMS) {
    await addEnumValueIfExists(db, name, 'canceled');
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // PostgreSQL enums do not support dropping values safely.
}
