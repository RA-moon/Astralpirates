import { and, eq } from '@payloadcms/db-postgres/drizzle';
import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  timestamp,
  varchar,
} from '@payloadcms/db-postgres/drizzle/pg-core';
import type { Payload } from 'payload';

const usersTable = pgTable('users', {
  id: integer('id').primaryKey(),
  elsaTokens: numeric('elsa_tokens', { mode: 'number' }).default(0),
  updatedAt: timestamp('updated_at', {
    mode: 'string',
    withTimezone: true,
    precision: 3,
  })
    .defaultNow()
    .notNull(),
});

const elsaTransactionsTable = pgTable('elsa_transactions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  type: varchar('type', { length: 32 }).notNull(),
  amount: numeric('amount', { mode: 'number' }).notNull(),
  delta: numeric('delta', { mode: 'number' }).notNull(),
  balanceAfter: numeric('balance_after', { mode: 'number' }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown> | null>().default(null),
  idempotencyKey: varchar('idempotency_key', { length: 128 }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull(),
});

export type ElsaTransactionType =
  | 'grant'
  | 'spend'
  | 'refund'
  | 'top_up'
  | 'adjustment'
  | 'backfill';

export type ElsaTransactionRecord = typeof elsaTransactionsTable.$inferSelect;

type ElsaLedgerTransactionAdapter = {
  findByIdempotencyKey: (key: string) => Promise<ElsaTransactionRecord | null>;
  readBalance: (userId: number) => Promise<number | null>;
  writeBalance: (userId: number, balance: number, updatedAtIso: string) => Promise<void>;
  insertTransaction: (row: NewElsaTransactionRow) => Promise<ElsaTransactionRecord>;
};

type ElsaLedgerAdapter = {
  withTransaction: <T>(runner: (tx: ElsaLedgerTransactionAdapter) => Promise<T>) => Promise<T>;
};

type NewElsaTransactionRow = Omit<
  typeof elsaTransactionsTable.$inferInsert,
  'id' | 'createdAt'
> & { createdAt: string };

const normaliseNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const sanitizeIdempotencyKey = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 128) return trimmed;
  return trimmed.slice(0, 128);
};

const isMissingLedgerTableError = (error: unknown): boolean => {
  if (!error) return false;
  const code = (error as any)?.code;
  if (code === '42P01') return true; // PostgreSQL undefined_table
  const message = (error as any)?.message;
  if (typeof message === 'string' && message.toLowerCase().includes('elsa_transactions')) {
    return true;
  }
  return false;
};

const createDrizzleAdapter = (payload: Payload): ElsaLedgerAdapter => {
  const db = payload.db?.drizzle;
  if (!db) {
    throw new Error('Payload database adapter is unavailable for ELSA ledger operations.');
  }

  return {
    withTransaction: async (runner) =>
      db.transaction(async (tx) => {
        const findByIdempotencyKey: ElsaLedgerTransactionAdapter['findByIdempotencyKey'] =
          async (key) => {
            const existing = await tx
              .select()
              .from(elsaTransactionsTable)
              .where(eq(elsaTransactionsTable.idempotencyKey, key))
              .limit(1);
            return existing[0] ?? null;
          };

        const readBalance: ElsaLedgerTransactionAdapter['readBalance'] = async (userId) => {
          const rows = await tx
            .select({ balance: usersTable.elsaTokens })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1)
            .for('update');
          const row = rows[0];
          if (!row) return null;
          return normaliseNumber(row.balance);
        };

        const writeBalance: ElsaLedgerTransactionAdapter['writeBalance'] = async (
          userId,
          balance,
          updatedAtIso,
        ) => {
          await tx
            .update(usersTable)
            .set({ elsaTokens: balance, updatedAt: updatedAtIso })
            .where(eq(usersTable.id, userId));
        };

        const insertTransaction: ElsaLedgerTransactionAdapter['insertTransaction'] = async (
          row,
        ) => {
          const inserted = await tx
            .insert(elsaTransactionsTable)
            .values(row)
            .onConflictDoNothing({
              target: elsaTransactionsTable.idempotencyKey,
            })
            .returning();
          const record = inserted[0];
          if (!record && row.idempotencyKey) {
            const fallback = await tx
              .select()
              .from(elsaTransactionsTable)
              .where(
                and(
                  eq(elsaTransactionsTable.userId, row.userId),
                  eq(elsaTransactionsTable.idempotencyKey, row.idempotencyKey),
                ),
              )
              .limit(1);
            if (fallback[0]) return fallback[0];
          }
          if (!record) {
            throw new Error('Failed to persist ELSA ledger transaction.');
          }
          return record;
        };

        return runner({
          findByIdempotencyKey,
          readBalance,
          writeBalance,
          insertTransaction,
        });
      }),
  };
};

export type ApplyElsaDeltaOptions = {
  payload: Payload;
  userId: number;
  delta: number;
  type: ElsaTransactionType;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  clampToZero?: boolean;
  adapter?: ElsaLedgerAdapter;
};

export type ApplyElsaDeltaResult = {
  applied: boolean;
  idempotentHit: boolean;
  balanceBefore: number;
  balanceAfter: number;
  transaction: ElsaTransactionRecord;
};

const applyElsaDeltaWithAdapter = async ({
  payload,
  userId,
  delta,
  type,
  metadata,
  idempotencyKey,
  clampToZero = true,
  adapter: providedAdapter,
}: ApplyElsaDeltaOptions): Promise<ApplyElsaDeltaResult> => {
  if (!Number.isFinite(delta)) {
    throw new Error('ELSAs mutation delta must be a finite number.');
  }

  const adapter = providedAdapter ?? createDrizzleAdapter(payload);
  const key = sanitizeIdempotencyKey(idempotencyKey);
  const nowIso = new Date().toISOString();

  return adapter.withTransaction(async (tx) => {
    if (key) {
      const existing = await tx.findByIdempotencyKey(key);
      if (existing) {
        const balanceAfter = normaliseNumber(existing.balanceAfter);
        const balanceBefore = balanceAfter - normaliseNumber(existing.delta);
        return {
          applied: false,
          idempotentHit: true,
          balanceAfter,
          balanceBefore,
          transaction: existing,
        };
      }
    }

    const balanceBeforeRaw = await tx.readBalance(userId);
    if (balanceBeforeRaw == null) {
      throw new Error(`User ${userId} not found while applying ELSA delta.`);
    }
    const balanceBefore = clampToZero ? Math.max(0, balanceBeforeRaw) : balanceBeforeRaw;
    const balanceAfter = clampToZero ? Math.max(0, balanceBefore + delta) : balanceBefore + delta;

    await tx.writeBalance(userId, balanceAfter, nowIso);

    const transaction = await tx.insertTransaction({
      userId,
      type,
      amount: Math.abs(delta),
      delta,
      balanceAfter,
      metadata: metadata ?? null,
      idempotencyKey: key,
      createdAt: nowIso,
    });

    return {
      applied: true,
      idempotentHit: false,
      balanceBefore,
      balanceAfter,
      transaction,
    };
  });
};

const applyElsaDeltaFallback = async (
  options: ApplyElsaDeltaOptions,
  cause: unknown,
): Promise<ApplyElsaDeltaResult> => {
  const { payload, userId, delta, type, metadata, idempotencyKey, clampToZero = true } = options;
  const db = payload.db?.drizzle;
  if (!db) {
    throw cause instanceof Error ? cause : new Error('ELSAs fallback unavailable; no database adapter');
  }

  const logger = payload.logger?.warn?.bind(payload.logger) ?? null;
  const key = sanitizeIdempotencyKey(idempotencyKey);
  const nowIso = new Date().toISOString();

  const result = await db.transaction(async (tx) => {
    const balances = await tx
      .select({ balance: usersTable.elsaTokens })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1)
      .for('update');

    if (!balances[0]) {
      throw new Error(`User ${userId} not found while applying ELSA delta (fallback).`);
    }

    const balanceBeforeRaw = balances[0]?.balance;
    const balanceBefore = clampToZero
      ? Math.max(0, normaliseNumber(balanceBeforeRaw))
      : normaliseNumber(balanceBeforeRaw);
    const balanceAfter = clampToZero ? Math.max(0, balanceBefore + delta) : balanceBefore + delta;

    await tx
      .update(usersTable)
      .set({ elsaTokens: balanceAfter, updatedAt: nowIso })
      .where(eq(usersTable.id, userId));

    const mergedMetadata =
      metadata && typeof metadata === 'object'
        ? { ...metadata, fallback: 'missing_elsa_transactions' }
        : { fallback: 'missing_elsa_transactions' };

    const transaction: ElsaTransactionRecord = {
      id: -1,
      userId,
      type,
      amount: Math.abs(delta),
      delta,
      balanceAfter,
      metadata: mergedMetadata,
      idempotencyKey: key,
      createdAt: nowIso,
    };

    return {
      applied: true,
      idempotentHit: false,
      balanceBefore,
      balanceAfter,
      transaction,
    };
  });

  if (logger) {
    logger({ err: cause, userId, fallback: 'elsa_tokens_only' }, 'ELSAs ledger missing; applied fallback balance update');
  }

  return result;
};

export const applyElsaDelta = async (options: ApplyElsaDeltaOptions): Promise<ApplyElsaDeltaResult> => {
  try {
    return await applyElsaDeltaWithAdapter(options);
  } catch (error) {
    if (isMissingLedgerTableError(error)) {
      return applyElsaDeltaFallback(options, error);
    }
    throw error;
  }
};

type ElsaAmountOptions = Omit<ApplyElsaDeltaOptions, 'delta' | 'type'> & {
  amount: number;
  type?: ElsaTransactionType;
};

export const grantElsa = (options: ElsaAmountOptions) =>
  applyElsaDelta({
    ...options,
    delta: Math.max(0, options.amount),
    type: options.type ?? 'grant',
  });

export const spendElsa = (options: ElsaAmountOptions) =>
  applyElsaDelta({
    ...options,
    delta: -Math.max(0, options.amount),
    type: options.type ?? 'spend',
  });

export const refundElsa = (options: ElsaAmountOptions) =>
  applyElsaDelta({
    ...options,
    delta: Math.max(0, options.amount),
    type: options.type ?? 'refund',
  });
