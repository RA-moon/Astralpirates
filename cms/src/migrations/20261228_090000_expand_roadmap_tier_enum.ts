import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const enumIdentifier = (name: string) => `"public"."${name}"`;
const enumLiteral = (name: string) => `'${name}'`;

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
  for (const value of ['tier4', 'tier5']) {
    await addEnumValueIfExists(db, 'enum_roadmap_tiers_tier', value);
  }

  for (const value of ['tier4', 'tier5', 'platform', 'support', 'meta']) {
    await addEnumValueIfExists(db, 'enum_plans_tier', value);
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // PostgreSQL enums do not support dropping values safely.
}
