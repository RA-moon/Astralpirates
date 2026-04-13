import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_flight_plan_memberships_role' AND n.nspname = 'public'
      ) THEN
        CREATE TYPE "public"."enum_flight_plan_memberships_role" AS ENUM ('owner', 'participant');
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_flight_plan_memberships_invitation_status' AND n.nspname = 'public'
      ) THEN
        CREATE TYPE "public"."enum_flight_plan_memberships_invitation_status" AS ENUM ('pending', 'accepted', 'declined', 'revoked');
      END IF;
    END
    $$;
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "public"."flight_plan_memberships" (
      "id" serial PRIMARY KEY,
      "flight_plan_id" integer NOT NULL REFERENCES "public"."flight_plans"("id") ON DELETE CASCADE,
      "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
      "role" "public"."enum_flight_plan_memberships_role" NOT NULL DEFAULT 'participant',
      "invitation_status" "public"."enum_flight_plan_memberships_invitation_status" NOT NULL DEFAULT 'pending',
      "invited_by_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE RESTRICT,
      "invited_at" timestamptz NOT NULL DEFAULT NOW(),
      "responded_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT NOW(),
      "updated_at" timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "flight_plan_memberships_unique_member"
    ON "public"."flight_plan_memberships" ("flight_plan_id", "user_id");
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "flight_plan_memberships_single_owner"
    ON "public"."flight_plan_memberships" ("flight_plan_id")
    WHERE "role" = 'owner';
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_memberships_status_idx"
    ON "public"."flight_plan_memberships" ("invitation_status", "flight_plan_id");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_memberships_user_idx"
    ON "public"."flight_plan_memberships" ("user_id");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_memberships_flight_plan_idx"
    ON "public"."flight_plan_memberships" ("flight_plan_id");
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "public"."flight_plan_membership_events" (
      "id" bigserial PRIMARY KEY,
      "membership_id" integer REFERENCES "public"."flight_plan_memberships"("id") ON DELETE CASCADE,
      "flight_plan_id" integer NOT NULL REFERENCES "public"."flight_plans"("id") ON DELETE CASCADE,
      "user_id" integer NOT NULL REFERENCES "public"."users"("id") ON DELETE CASCADE,
      "event_type" varchar NOT NULL,
      "payload" jsonb NOT NULL,
      "attempts" integer NOT NULL DEFAULT 0,
      "last_error" text,
      "queued_at" timestamptz NOT NULL DEFAULT NOW(),
      "locked_at" timestamptz,
      "processed_at" timestamptz
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_membership_events_pending_idx"
    ON "public"."flight_plan_membership_events" ("processed_at", "queued_at")
    WHERE "processed_at" IS NULL;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_membership_events_membership_idx"
    ON "public"."flight_plan_membership_events" ("membership_id");
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "flight_plan_membership_events_flight_plan_idx"
    ON "public"."flight_plan_membership_events" ("flight_plan_id");
  `);

  await db.execute(sql`
    WITH inserted AS (
      INSERT INTO "public"."flight_plan_memberships" (
        "flight_plan_id",
        "user_id",
        "role",
        "invitation_status",
        "invited_by_id",
        "invited_at",
        "responded_at",
        "created_at",
        "updated_at"
      )
      SELECT
        fp."id" AS "flight_plan_id",
        fp."owner_id" AS "user_id",
        'owner'::"public"."enum_flight_plan_memberships_role" AS "role",
        'accepted'::"public"."enum_flight_plan_memberships_invitation_status" AS "invitation_status",
        fp."owner_id" AS "invited_by_id",
        COALESCE(fp."updated_at", fp."created_at", NOW()) AS "invited_at",
        COALESCE(fp."updated_at", fp."created_at") AS "responded_at",
        COALESCE(fp."created_at", NOW()) AS "created_at",
        COALESCE(fp."updated_at", NOW()) AS "updated_at"
      FROM "public"."flight_plans" fp
      WHERE fp."owner_id" IS NOT NULL
      ON CONFLICT ("flight_plan_id", "user_id") DO NOTHING
      RETURNING *
    )
    INSERT INTO "public"."flight_plan_membership_events" (
      "membership_id",
      "flight_plan_id",
      "user_id",
      "event_type",
      "payload"
    )
    SELECT
      ins."id",
      ins."flight_plan_id",
      ins."user_id",
      'sync' AS "event_type",
      jsonb_build_object(
        'flightPlanId', ins."flight_plan_id",
        'userId', ins."user_id",
        'role', ins."role",
        'status', ins."invitation_status",
        'invitedById', ins."invited_by_id",
        'invitedAt', ins."invited_at",
        'respondedAt', ins."responded_at"
      ) AS "payload"
    FROM inserted ins;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "public"."flight_plan_membership_events";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "flight_plan_membership_events_pending_idx";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "flight_plan_membership_events_membership_idx";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "flight_plan_membership_events_flight_plan_idx";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "flight_plan_memberships_unique_member";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "flight_plan_memberships_single_owner";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "flight_plan_memberships_status_idx";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "flight_plan_memberships_user_idx";
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS "flight_plan_memberships_flight_plan_idx";
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS "public"."flight_plan_memberships";
  `);

  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_flight_plan_memberships_role' AND n.nspname = 'public'
      ) THEN
        DROP TYPE "public"."enum_flight_plan_memberships_role";
      END IF;

      IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_flight_plan_memberships_invitation_status' AND n.nspname = 'public'
      ) THEN
        DROP TYPE "public"."enum_flight_plan_memberships_invitation_status";
      END IF;
    END
    $$;
  `);
}
