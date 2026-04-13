import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const USERS_TABLE = '"public"."users"';
const REVISIONS_TABLE = '"public"."editor_document_revisions"';
const LOCKS_TABLE = '"public"."editor_document_locks"';
const IDEMPOTENCY_TABLE = '"public"."editor_write_idempotency"';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.raw(REVISIONS_TABLE)} (
      "document_type" varchar(32) NOT NULL,
      "document_id" integer NOT NULL,
      "revision" bigint NOT NULL DEFAULT 1,
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "editor_document_revisions_pk"
        PRIMARY KEY ("document_type", "document_id"),
      CONSTRAINT "editor_document_revisions_document_type_ck"
        CHECK ("document_type" IN ('flight-plan', 'page')),
      CONSTRAINT "editor_document_revisions_revision_ck"
        CHECK ("revision" >= 1)
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.raw(LOCKS_TABLE)} (
      "document_type" varchar(32) NOT NULL,
      "document_id" integer NOT NULL,
      "lock_mode" varchar(16) NOT NULL DEFAULT 'soft',
      "holder_user_id" integer NOT NULL REFERENCES ${sql.raw(USERS_TABLE)}("id") ON DELETE CASCADE,
      "holder_session_id" varchar(128) NOT NULL,
      "acquired_at" timestamptz NOT NULL DEFAULT NOW(),
      "expires_at" timestamptz NOT NULL,
      "last_heartbeat_at" timestamptz NOT NULL DEFAULT NOW(),
      "takeover_reason" text,
      CONSTRAINT "editor_document_locks_pk"
        PRIMARY KEY ("document_type", "document_id"),
      CONSTRAINT "editor_document_locks_document_type_ck"
        CHECK ("document_type" IN ('flight-plan', 'page')),
      CONSTRAINT "editor_document_locks_mode_ck"
        CHECK ("lock_mode" IN ('soft', 'hard'))
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "editor_document_locks_expires_idx"
      ON ${sql.raw(LOCKS_TABLE)} USING btree ("expires_at");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ${sql.raw(IDEMPOTENCY_TABLE)} (
      "id" serial PRIMARY KEY,
      "document_type" varchar(32) NOT NULL,
      "document_id" integer NOT NULL,
      "idempotency_key" varchar(128) NOT NULL,
      "request_hash" varchar(128) NOT NULL,
      "response_status" integer,
      "response_body" jsonb,
      "resulting_revision" bigint,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "editor_write_idempotency_document_type_ck"
        CHECK ("document_type" IN ('flight-plan', 'page')),
      CONSTRAINT "editor_write_idempotency_key_ck"
        CHECK (length(trim("idempotency_key")) > 0),
      CONSTRAINT "editor_write_idempotency_request_hash_ck"
        CHECK (length(trim("request_hash")) > 0)
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "editor_write_idempotency_unique_key"
      ON ${sql.raw(IDEMPOTENCY_TABLE)} USING btree ("document_type", "document_id", "idempotency_key");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "editor_write_idempotency_created_idx"
      ON ${sql.raw(IDEMPOTENCY_TABLE)} USING btree ("created_at");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS ${sql.raw(IDEMPOTENCY_TABLE)} CASCADE;`);
  await db.execute(sql`DROP TABLE IF EXISTS ${sql.raw(LOCKS_TABLE)} CASCADE;`);
  await db.execute(sql`DROP TABLE IF EXISTS ${sql.raw(REVISIONS_TABLE)} CASCADE;`);
}
