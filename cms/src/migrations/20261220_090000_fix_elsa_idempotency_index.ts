import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TRANSACTIONS_TABLE = sql.raw(`"public"."elsa_transactions"`);
const IDEMPOTENCY_INDEX = sql.raw(`"elsa_transactions_idempotency_key_idx"`);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // The initial ledger migration created a *partial* unique index on idempotency_key.
  // Postgres requires the conflict target predicate to match a partial unique index, but
  // our Drizzle `onConflictDoNothing({ target })` call does not include one.
  // A plain unique index works because Postgres allows multiple NULLs in UNIQUE columns.
  await db.execute(sql`DROP INDEX IF EXISTS ${IDEMPOTENCY_INDEX};`);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ${IDEMPOTENCY_INDEX}
      ON ${TRANSACTIONS_TABLE} USING btree ("idempotency_key");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP INDEX IF EXISTS ${IDEMPOTENCY_INDEX};`);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS ${IDEMPOTENCY_INDEX}
      ON ${TRANSACTIONS_TABLE} USING btree ("idempotency_key")
      WHERE "idempotency_key" IS NOT NULL;
  `);
}

