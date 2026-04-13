import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.message_encryption_keys (
      id serial PRIMARY KEY,
      user_id integer NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
      public_key bytea NOT NULL,
      sealed_private_key bytea NOT NULL,
      version integer NOT NULL DEFAULT 1,
      rotated_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS message_encryption_keys_user_idx
      ON public.message_encryption_keys (user_id);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.message_threads (
      id bigserial PRIMARY KEY,
      slug varchar(160) NOT NULL UNIQUE,
      participant_a_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      participant_b_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      encrypted_thread_key bytea NOT NULL,
      thread_key_nonce bytea NOT NULL,
      thread_key_tag bytea NOT NULL,
      thread_key_version integer NOT NULL DEFAULT 1,
      last_message_at timestamptz,
      last_sender_id integer REFERENCES public.users(id) ON DELETE SET NULL,
      unread_a integer NOT NULL DEFAULT 0,
      unread_b integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT NOW(),
      updated_at timestamptz NOT NULL DEFAULT NOW(),
      CONSTRAINT message_threads_participants_not_equal CHECK (participant_a_id <> participant_b_id)
    );
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS message_threads_participant_pair_idx
      ON public.message_threads (
        LEAST(participant_a_id, participant_b_id),
        GREATEST(participant_a_id, participant_b_id)
      );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS message_threads_last_message_idx
      ON public.message_threads (last_message_at DESC NULLS LAST);
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS public.messages (
      id bigserial PRIMARY KEY,
      thread_id bigint NOT NULL REFERENCES public.message_threads(id) ON DELETE CASCADE,
      sender_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      recipient_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
      body_ciphertext bytea NOT NULL,
      body_nonce bytea NOT NULL,
      body_auth_tag bytea NOT NULL,
      body_preview varchar(240),
      created_at timestamptz NOT NULL DEFAULT NOW(),
      read_at timestamptz
    );
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS messages_thread_idx
      ON public.messages (thread_id, created_at);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS messages_recipient_unread_idx
      ON public.messages (recipient_id, read_at);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS messages_recipient_unread_idx;
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS messages_thread_idx;
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS public.messages;
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS message_threads_last_message_idx;
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS message_threads_participant_pair_idx;
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS public.message_threads;
  `);

  await db.execute(sql`
    DROP INDEX IF EXISTS message_encryption_keys_user_idx;
  `);

  await db.execute(sql`
    DROP TABLE IF EXISTS public.message_encryption_keys;
  `);
}
