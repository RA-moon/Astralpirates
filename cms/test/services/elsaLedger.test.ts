import { describe, expect, it } from 'vitest';

import { applyElsaDelta, type ApplyElsaDeltaResult } from '@/src/services/elsaLedger';

type InMemoryLedgerState = {
  balances: Map<number, number>;
  transactions: Array<ApplyElsaDeltaResult['transaction']>;
};

const createAdapter = () => {
  const state: InMemoryLedgerState = {
    balances: new Map(),
    transactions: [],
  };

  const adapter = {
    withTransaction: async <T>(runner: any): Promise<T> =>
      runner({
        findByIdempotencyKey: async (key: string) =>
          state.transactions.find((entry) => entry.idempotencyKey === key) ?? null,
        readBalance: async (userId: number) => state.balances.get(userId) ?? null,
        writeBalance: async (userId: number, balance: number) => {
          state.balances.set(userId, balance);
        },
        insertTransaction: async (row) => {
          const record = {
            ...row,
            id: state.transactions.length + 1,
          } as ApplyElsaDeltaResult['transaction'];
          state.transactions.push(record);
          return record;
        },
      }),
    state,
  };

  return adapter;
};

describe('applyElsaDelta', () => {
  it('applies a delta and clamps at zero', async () => {
    const adapter = createAdapter();
    adapter.state.balances.set(1, 2);

    const result = await applyElsaDelta({
      payload: {} as any,
      userId: 1,
      delta: -5,
      type: 'spend',
      adapter,
    });

    expect(result.applied).toBe(true);
    expect(result.balanceAfter).toBe(0);
    expect(adapter.state.transactions[0]?.balanceAfter).toBe(0);
  });

  it('returns the prior transaction when an idempotency key is reused', async () => {
    const adapter = createAdapter();
    adapter.state.balances.set(2, 5);

    await applyElsaDelta({
      payload: {} as any,
      userId: 2,
      delta: -2,
      type: 'spend',
      idempotencyKey: 'reused-key',
      adapter,
    });

    const result = await applyElsaDelta({
      payload: {} as any,
      userId: 2,
      delta: -2,
      type: 'spend',
      idempotencyKey: 'reused-key',
      adapter,
    });

    expect(result.applied).toBe(false);
    expect(result.idempotentHit).toBe(true);
    expect(result.balanceAfter).toBe(3);
    expect(adapter.state.transactions).toHaveLength(1);
  });

  it('throws when the user balance cannot be loaded', async () => {
    const adapter = createAdapter();
    await expect(
      applyElsaDelta({
        payload: {} as any,
        userId: 999,
        delta: 1,
        type: 'grant',
        adapter,
      }),
    ).rejects.toThrow(/not found/i);
  });
});
