import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

const VOTE_ENUM = 'enum_comment_votes_vote_type';
const VOTE_ENUM_IDENT = `"public"."${VOTE_ENUM}"`;
const VOTE_ENUM_LITERAL = `'${VOTE_ENUM}'`;

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = ${VOTE_ENUM_LITERAL} AND n.nspname = 'public'
        ) THEN
          CREATE TYPE ${VOTE_ENUM_IDENT} AS ENUM ('up', 'down');
        END IF;
      END
      $$;
    `),
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "public"."comment_threads" (
      "id" serial PRIMARY KEY,
      "resource_type" varchar NOT NULL,
      "resource_id" integer NOT NULL,
      "created_by" integer REFERENCES "public"."users"("id") ON DELETE SET NULL,
      "locked" boolean NOT NULL DEFAULT false,
      "pinned" boolean NOT NULL DEFAULT false,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "comment_threads_resource_idx"
    ON "public"."comment_threads" ("resource_type", "resource_id");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "comment_threads_resource_lookup_idx"
    ON "public"."comment_threads" ("resource_type", "resource_id", "locked");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "public"."comments" (
      "id" serial PRIMARY KEY,
      "thread_id" integer NOT NULL REFERENCES "public"."comment_threads"("id") ON DELETE CASCADE,
      "parent_comment_id" integer REFERENCES "public"."comments"("id") ON DELETE CASCADE,
      "body_raw" text NOT NULL,
      "body_html" text NOT NULL,
      "created_by" integer REFERENCES "public"."users"("id") ON DELETE SET NULL,
      "edited_at" timestamptz DEFAULT NULL,
      "deleted_at" timestamptz DEFAULT NULL,
      "is_internal" boolean NOT NULL DEFAULT false,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "comments_thread_parent_idx"
    ON "public"."comments" ("thread_id", "parent_comment_id", "created_at");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "comments_author_idx"
    ON "public"."comments" ("created_by");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "public"."comment_counters" (
      "comment_id" integer PRIMARY KEY REFERENCES "public"."comments"("id") ON DELETE CASCADE,
      "score" integer NOT NULL DEFAULT 0,
      "up_count" integer NOT NULL DEFAULT 0,
      "down_count" integer NOT NULL DEFAULT 0,
      "reply_count" integer NOT NULL DEFAULT 0,
      "last_activity_at" timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "comment_counters_score_idx"
    ON "public"."comment_counters" ("score" DESC, "last_activity_at" DESC);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "public"."comment_votes" (
      "id" serial PRIMARY KEY,
      "comment_id" integer NOT NULL REFERENCES "public"."comments"("id") ON DELETE CASCADE,
      "voter_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
      "vote_type" ${sql.raw(VOTE_ENUM_IDENT)} NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT "comment_votes_unique_vote" UNIQUE ("comment_id", "voter_id")
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "comment_votes_voter_idx"
    ON "public"."comment_votes" ("voter_id");
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "comment_votes_voter_idx";
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS "public"."comment_votes";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "comment_counters_score_idx";
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS "public"."comment_counters";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "comments_author_idx";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "comments_thread_parent_idx";
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS "public"."comments";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "comment_threads_resource_lookup_idx";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "comment_threads_resource_idx";
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS "public"."comment_threads";
  `);

  await db.execute(
    sql.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type t
          JOIN pg_namespace n ON n.oid = t.typnamespace
          WHERE t.typname = ${VOTE_ENUM_LITERAL} AND n.nspname = 'public'
        ) THEN
          DROP TYPE ${VOTE_ENUM_IDENT};
        END IF;
      END
      $$;
    `),
  );
}
