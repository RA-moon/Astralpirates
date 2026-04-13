import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const NEW_VALUES = ['engineering', 'control', 'bay'] as const;
const ENUM_TYPES = [
  '"public"."enum_navigation_nodes_node_id"',
  '"public"."enum_pages_navigation_node_id"',
  '"public"."enum_pages_blocks_navigation_module_node_id"',
] as const;

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
  for (const typeName of ENUM_TYPES) {
    for (const value of NEW_VALUES) {
      await db.execute(sql.raw(buildAddValueStatement(typeName, value)));
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // values remain even if rolled back
  return Promise.resolve();
}
