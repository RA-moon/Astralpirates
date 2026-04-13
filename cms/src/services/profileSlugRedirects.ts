import { randomUUID } from 'node:crypto';

import { and, eq, isNull, ne } from '@payloadcms/db-postgres/drizzle';
import { integer, pgTable, text, timestamp } from '@payloadcms/db-postgres/drizzle/pg-core';
import type { Payload } from 'payload';

const PROFILE_SLUG_REDIRECTS = pgTable('profile_slug_redirects', {
  id: text('id').primaryKey().notNull(),
  fromSlug: text('from_slug').notNull(),
  toSlug: text('to_slug').notNull(),
  targetUserId: integer('target_user_id').notNull(),
  reason: text('reason').notNull().default('profile-rename'),
  createdAt: timestamp('created_at', {
    mode: 'string',
    withTimezone: true,
    precision: 3,
  }).defaultNow().notNull(),
  disabledAt: timestamp('disabled_at', {
    mode: 'string',
    withTimezone: true,
    precision: 3,
  }),
});

type ProfileSlugRedirectRecord = typeof PROFILE_SLUG_REDIRECTS.$inferSelect;

export type ProfileSlugRedirect = {
  fromSlug: string;
  toSlug: string;
  targetUserId: number;
  reason: ProfileSlugRedirectReason | string;
  createdAt: string | null;
  disabledAt: string | null;
};

type ProfileSlugRedirectInsert = Omit<ProfileSlugRedirectRecord, 'id'> & {
  id?: string;
  createdAt?: string | null;
  disabledAt?: string | null;
};

export type ProfileSlugRedirectReason = 'manual' | 'profile-rename';

type RedirectReadAdapter = {
  findActiveByFromSlug: (fromSlug: string) => Promise<ProfileSlugRedirect | null>;
  insert: (row: ProfileSlugRedirectInsert) => Promise<void>;
  disableByFromSlug: (fromSlug: string) => Promise<number>;
  disableByToSlug: (toSlug: string, preserveTargetUserId?: number) => Promise<number>;
};

type RedirectAdapter = {
  withTransaction: <T>(runner: (tx: RedirectReadAdapter) => Promise<T>) => Promise<T>;
};

type ServiceContext = {
  payload?: Payload;
  req?: { payload?: Payload };
  adapter?: RedirectAdapter;
};

type RecordRedirectInput = ServiceContext & {
  fromSlug: string;
  toSlug: string;
  targetUserId: number;
  reason?: ProfileSlugRedirectReason;
};

type FindRedirectInput = ServiceContext & {
  fromSlug: string;
};

type DisableRedirectInput = ServiceContext & {
  fromSlug?: string;
  targetSlug?: string;
  preserveTargetUserId?: number;
  reason?: ProfileSlugRedirectReason;
};

const normalizeSlug = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (!/^[a-z0-9-]+$/.test(trimmed)) return null;
  return trimmed;
};

const resolvePayload = (context: ServiceContext): Payload => {
  if (context.payload) return context.payload;
  if (context.req?.payload) return context.req.payload;
  throw new Error('Payload instance is required for profile slug redirect persistence.');
};

const toModel = (row: ProfileSlugRedirectRecord): ProfileSlugRedirect => ({
  fromSlug: row.fromSlug,
  toSlug: row.toSlug,
  targetUserId: row.targetUserId,
  reason: row.reason ?? 'manual',
  createdAt: row.createdAt,
  disabledAt: row.disabledAt ?? null,
});

const createDrizzleAdapter = (payload: Payload): RedirectAdapter => {
  const db = payload.db?.drizzle;
  if (!db) {
    throw new Error('Payload database adapter is unavailable for profile slug redirects.');
  }

  return {
    withTransaction: async (runner) =>
      db.transaction(async (tx) => {
        const findActiveByFromSlug: RedirectReadAdapter['findActiveByFromSlug'] = async (
          fromSlug,
        ) => {
          const rows = await tx
            .select()
            .from(PROFILE_SLUG_REDIRECTS)
            .where(and(eq(PROFILE_SLUG_REDIRECTS.fromSlug, fromSlug), isNull(PROFILE_SLUG_REDIRECTS.disabledAt)))
            .limit(1);
          return rows[0] ? toModel(rows[0] as ProfileSlugRedirectRecord) : null;
        };

        const insert: RedirectReadAdapter['insert'] = async (row) => {
          await tx.insert(PROFILE_SLUG_REDIRECTS).values({
            ...row,
            id: row.id ?? randomUUID(),
          });
        };

        const disableByFromSlug: RedirectReadAdapter['disableByFromSlug'] = async (fromSlug) => {
          const result = await tx
            .update(PROFILE_SLUG_REDIRECTS)
            .set({ disabledAt: new Date().toISOString() })
            .where(
              and(eq(PROFILE_SLUG_REDIRECTS.fromSlug, fromSlug), isNull(PROFILE_SLUG_REDIRECTS.disabledAt)),
            );
          return Number(result.rowCount ?? 0);
        };

        const disableByToSlug: RedirectReadAdapter['disableByToSlug'] = async (
          toSlug,
          preserveTargetUserId,
        ) => {
          const conditions = [eq(PROFILE_SLUG_REDIRECTS.toSlug, toSlug), isNull(PROFILE_SLUG_REDIRECTS.disabledAt)];
          if (typeof preserveTargetUserId === 'number') {
            conditions.push(ne(PROFILE_SLUG_REDIRECTS.targetUserId, preserveTargetUserId));
          }
          const result = await tx
            .update(PROFILE_SLUG_REDIRECTS)
            .set({ disabledAt: new Date().toISOString() })
            .where(and(...conditions));
          return Number(result.rowCount ?? 0);
        };

        return runner({
          findActiveByFromSlug,
          insert,
          disableByFromSlug,
          disableByToSlug,
        });
      }),
  };
};

const toAdapter = (context: ServiceContext): RedirectAdapter => {
  if (context.adapter) return context.adapter;
  const payload = resolvePayload(context);
  return createDrizzleAdapter(payload);
};

export const findActiveRedirect = async ({
  fromSlug,
  ...context
}: FindRedirectInput): Promise<ProfileSlugRedirect | null> => {
  const normalizedFrom = normalizeSlug(fromSlug);
  if (!normalizedFrom) return null;

  const adapter = toAdapter(context);
  return adapter.withTransaction((tx) => tx.findActiveByFromSlug(normalizedFrom));
};

export const disableRedirect = async ({
  fromSlug,
  targetSlug,
  preserveTargetUserId,
  ...context
}: DisableRedirectInput): Promise<void> => {
  const normalizedFromSlug = normalizeSlug(fromSlug);
  const normalizedTargetSlug = normalizeSlug(targetSlug);
  if (!normalizedFromSlug && !normalizedTargetSlug) return;

  const adapter = toAdapter(context);
  await adapter.withTransaction(async (tx) => {
    if (normalizedFromSlug) {
      await tx.disableByFromSlug(normalizedFromSlug);
    }
    if (normalizedTargetSlug) {
      await tx.disableByToSlug(normalizedTargetSlug, preserveTargetUserId);
    }
  });
};

export const recordRedirect = async ({
  fromSlug,
  toSlug,
  targetUserId,
  reason = 'profile-rename',
  ...context
}: RecordRedirectInput): Promise<void> => {
  const normalizedFromSlug = normalizeSlug(fromSlug);
  const normalizedToSlug = normalizeSlug(toSlug);
  if (!normalizedFromSlug || !normalizedToSlug || !Number.isFinite(targetUserId)) {
    return;
  }
  if (normalizedFromSlug === normalizedToSlug) return;

  const adapter = toAdapter(context);
  await adapter.withTransaction(async (tx) => {
    await tx.disableByFromSlug(normalizedFromSlug);
    await tx.disableByToSlug(normalizedToSlug, targetUserId);
    await tx.insert({
      fromSlug: normalizedFromSlug,
      toSlug: normalizedToSlug,
      targetUserId,
      reason,
      createdAt: new Date().toISOString(),
      disabledAt: null,
    });
  });

  const logger = context.payload?.logger ?? context.req?.payload?.logger;
  logger?.info?.(
    { fromSlug: normalizedFromSlug, toSlug: normalizedToSlug, targetUserId, reason },
    'Recorded profile slug redirect.',
  );
};
