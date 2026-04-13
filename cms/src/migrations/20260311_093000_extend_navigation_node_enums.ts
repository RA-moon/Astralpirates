import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const NEW_VALUES = ['engineering', 'control', 'bay'] as const;

const escapeValue = (value: string) => value.replace(/'/g, "''");
const buildAddValueStatement = (typeName: string, value: string) => `
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER TYPE ${typeName} ADD VALUE IF NOT EXISTS ''${escapeValue(value)}''';
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END;
$$;
`;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const value of NEW_VALUES) {
    await db.execute(sql.raw(buildAddValueStatement('"public"."enum_pages_navigation_node_id"', value)));
    await db.execute(
      sql.raw(buildAddValueStatement('"public"."enum_pages_blocks_navigation_module_node_id"', value)),
    );
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Postgres enums cannot easily drop values without recreating the type;
  // keep the additional IDs available even if the migration is rolled back.
  return Promise.resolve();
}
