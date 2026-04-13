import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const POLICY_TABLES = [
  'pages',
  'pages_blocks_hero',
  'pages_blocks_card_grid',
  'pages_blocks_timeline',
  'pages_blocks_image_carousel',
  'pages_blocks_cta_list',
  'pages_blocks_stat_grid',
  'pages_blocks_crew_preview',
  'pages_blocks_crew_roster',
  'pages_blocks_navigation_module',
  'plans',
  'roadmap_tiers',
  'roadmap_tiers_items',
  'flight_plans',
] as const;

const LOCK_TIMEOUT = '15s';
const STATEMENT_TIMEOUT = '5min';

const normalizeMigrationError = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
};

const policyColumnsUp = (table: string) => sql.raw(`
  SET lock_timeout = '${LOCK_TIMEOUT}';
  SET statement_timeout = '${STATEMENT_TIMEOUT}';
  ALTER TABLE "public"."${table}"
  ADD COLUMN IF NOT EXISTS "access_policy_mode" varchar,
  ADD COLUMN IF NOT EXISTS "access_policy_role_space" varchar,
  ADD COLUMN IF NOT EXISTS "access_policy_minimum_role" varchar;
  RESET statement_timeout;
  RESET lock_timeout;
`);

const policyColumnsDown = (table: string) => sql.raw(`
  SET lock_timeout = '${LOCK_TIMEOUT}';
  SET statement_timeout = '${STATEMENT_TIMEOUT}';
  ALTER TABLE "public"."${table}"
  DROP COLUMN IF EXISTS "access_policy_minimum_role",
  DROP COLUMN IF EXISTS "access_policy_role_space",
  DROP COLUMN IF EXISTS "access_policy_mode";
  RESET statement_timeout;
  RESET lock_timeout;
`);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const table of POLICY_TABLES) {
    try {
      await db.execute(policyColumnsUp(table));
    } catch (error) {
      throw new Error(
        `20261225_090000_add_access_policy_columns failed on table "${table}": ${normalizeMigrationError(error)}`,
      );
    }
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  for (const table of POLICY_TABLES) {
    try {
      await db.execute(policyColumnsDown(table));
    } catch (error) {
      throw new Error(
        `20261225_090000_add_access_policy_columns rollback failed on table "${table}": ${normalizeMigrationError(error)}`,
      );
    }
  }
}
