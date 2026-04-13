import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const TRANSACTIONS_TABLE = sql.raw(`"public"."elsa_transactions"`);
const USERS_TABLE = sql.raw(`"public"."users"`);

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${TRANSACTIONS_TABLE} (
      "id" serial PRIMARY KEY,
      "user_id" integer NOT NULL REFERENCES ${USERS_TABLE}("id") ON DELETE CASCADE,
      "type" varchar(32) NOT NULL,
      "amount" numeric NOT NULL,
      "delta" numeric NOT NULL,
      "balance_after" numeric NOT NULL,
      "metadata" jsonb,
      "idempotency_key" varchar(128),
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "elsa_transactions_amount_non_negative" CHECK ("amount" >= 0),
      CONSTRAINT "elsa_transactions_balance_non_negative" CHECK ("balance_after" >= 0)
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "elsa_transactions_user_created_idx"
      ON ${TRANSACTIONS_TABLE} USING btree ("user_id", "created_at" DESC);
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "elsa_transactions_idempotency_key_idx"
      ON ${TRANSACTIONS_TABLE} USING btree ("idempotency_key")
      WHERE "idempotency_key" IS NOT NULL;
  `);

  await db.execute(sql`
    INSERT INTO ${TRANSACTIONS_TABLE} (
      "user_id",
      "type",
      "amount",
      "delta",
      "balance_after",
      "metadata",
      "idempotency_key",
      "created_at"
    )
    SELECT
      u."id" AS "user_id",
      'backfill' AS "type",
      GREATEST(0, COALESCE(u."elsa_tokens", 0)) AS "amount",
      GREATEST(0, COALESCE(u."elsa_tokens", 0)) AS "delta",
      GREATEST(0, COALESCE(u."elsa_tokens", 0)) AS "balance_after",
      jsonb_build_object('source', 'elsa_tokens_column') AS "metadata",
      CONCAT('elsa-backfill-20260418:', u."id") AS "idempotency_key",
      NOW() AS "created_at"
    FROM ${USERS_TABLE} u
    WHERE GREATEST(0, COALESCE(u."elsa_tokens", 0)) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM ${TRANSACTIONS_TABLE} t
        WHERE t."idempotency_key" = CONCAT('elsa-backfill-20260418:', u."id")
      );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS ${TRANSACTIONS_TABLE} CASCADE;`);
}
