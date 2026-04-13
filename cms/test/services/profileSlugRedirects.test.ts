import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ProfileSlugRedirect,
  disableRedirect,
  findActiveRedirect,
  recordRedirect,
} from '@/src/services/profileSlugRedirects';

type RedirectState = {
  fromSlug: string;
  toSlug: string;
  targetUserId: number;
  reason: string;
  createdAt: string;
  disabledAt: string | null;
};

const createStatefulAdapter = (seed: RedirectState[] = []) => {
  let rows = [...seed];
  const calls: Record<string, { args: unknown[] }> = {
    findActiveByFromSlug: { args: [] },
    insert: { args: [] },
    disableByFromSlug: { args: [] },
    disableByToSlug: { args: [] },
  };

  const callRows = () => rows;

  return {
    calls,
    withTransaction: vi.fn(async (runner) =>
      runner({
        findActiveByFromSlug: async (fromSlug: string) => {
          calls.findActiveByFromSlug.args.push(fromSlug);
          return (rows.find((row) => row.fromSlug === fromSlug && row.disabledAt === null) ??
            null) as ProfileSlugRedirect | null;
        },
        insert: async (row: Omit<RedirectState, 'id'>) => {
          calls.insert.args.push(row);
          rows = [
            ...rows,
            {
              ...row,
              reason: row.reason,
              createdAt: row.createdAt ?? new Date().toISOString(),
              disabledAt: row.disabledAt ?? null,
            },
          ];
        },
        disableByFromSlug: async (fromSlug: string) => {
          calls.disableByFromSlug.args.push(fromSlug);
          const matched = rows.filter(
            (entry) => entry.fromSlug === fromSlug && entry.disabledAt === null,
          );
          rows = rows.map((entry) =>
            entry.fromSlug === fromSlug && entry.disabledAt === null
              ? { ...entry, disabledAt: new Date(2026, 0, 1, 0, 0, 0, 0).toISOString() }
              : entry,
          );
          return matched.length;
        },
        disableByToSlug: async (toSlug: string, preserveTargetUserId?: number) => {
          calls.disableByToSlug.args.push({ toSlug, preserveTargetUserId });
          const shouldDisable = (entry: RedirectState) => {
            if (entry.toSlug !== toSlug || entry.disabledAt !== null) return false;
            if (typeof preserveTargetUserId === 'number') {
              return entry.targetUserId !== preserveTargetUserId;
            }
            return true;
          };
          const matched = rows.filter(shouldDisable);
          rows = rows.map((entry) => (shouldDisable(entry) ? { ...entry, disabledAt: new Date().toISOString() } : entry));
          return matched.length;
        },
      }),
    ),
    rows: () => callRows(),
    callsSnapshot: () =>
      Object.fromEntries(Object.entries(calls).map(([key, value]) => [key, [...value.args]])),
  };
};

describe('profileSlugRedirects service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes and records active slug redirects', async () => {
    const adapter = createStatefulAdapter();
    await recordRedirect({
      adapter,
      fromSlug: 'Old-Captain',
      toSlug: 'New-Captain',
      targetUserId: 42,
    });

    const rows = adapter.rows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      fromSlug: 'old-captain',
      toSlug: 'new-captain',
      targetUserId: 42,
    });
  });

  it('looks up active redirects by normalized fromSlug', async () => {
    const adapter = createStatefulAdapter([
      {
        fromSlug: 'captain-old',
        toSlug: 'captain-new',
        targetUserId: 7,
        reason: 'profile-rename',
        createdAt: '2026-03-30T00:00:00.000Z',
        disabledAt: null,
      },
    ]);

    const found = await findActiveRedirect({ adapter, fromSlug: 'CAPTAIN-OLD' });

    expect(found).toEqual({
      fromSlug: 'captain-old',
      toSlug: 'captain-new',
      targetUserId: 7,
      reason: 'profile-rename',
      createdAt: '2026-03-30T00:00:00.000Z',
      disabledAt: null,
    });
    expect(adapter.callsSnapshot().findActiveByFromSlug).toEqual(['captain-old']);
  });

  it('disables redirects by fromSlug and targetSlug with optional preserve target', async () => {
    const adapter = createStatefulAdapter([
      {
        fromSlug: 'captain-old',
        toSlug: 'captain-new',
        targetUserId: 7,
        reason: 'profile-rename',
        createdAt: '2026-03-30T00:00:00.000Z',
        disabledAt: null,
      },
      {
        fromSlug: 'captain-alt',
        toSlug: 'captain-new',
        targetUserId: 11,
        reason: 'profile-rename',
        createdAt: '2026-03-30T00:00:00.000Z',
        disabledAt: null,
      },
    ]);

    await disableRedirect({
      adapter,
      targetSlug: 'Captain-New',
      preserveTargetUserId: 11,
      fromSlug: 'captain-alt',
    });

    const calls = adapter.callsSnapshot();
    expect(calls.disableByFromSlug).toEqual(['captain-alt']);
    expect(calls.disableByToSlug).toEqual([{ toSlug: 'captain-new', preserveTargetUserId: 11 }]);

    const rows = adapter.rows();
    expect(rows.filter((entry) => entry.disabledAt === null).map((entry) => entry.fromSlug)).toEqual([]);
  });
});
