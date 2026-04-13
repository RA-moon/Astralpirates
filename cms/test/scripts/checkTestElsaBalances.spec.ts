import { describe, expect, it } from 'vitest';

import {
  summarizeBalanceChecks,
  type BalanceCheckSummary,
} from '@/src/scripts/checkTestElsaBalances.helpers.ts';

describe('summarizeBalanceChecks', () => {
  it('separates missing and insufficient balances', () => {
    const summary: BalanceCheckSummary = summarizeBalanceChecks([
      { email: 'captain@test.com', role: 'captain', required: 2, actual: 2, missing: false },
      { email: 'crew@test.com', role: 'swabbie', required: 2, actual: 1, missing: false },
      { email: 'missing@test.com', role: 'swabbie', required: 2, actual: null, missing: true },
    ]);

    expect(summary.ok).toHaveLength(1);
    expect(summary.insufficient).toHaveLength(1);
    expect(summary.missingUsers).toHaveLength(1);
    expect(summary.insufficient[0]).toMatchObject({ email: 'crew@test.com' });
    expect(summary.missingUsers[0]).toMatchObject({ email: 'missing@test.com' });
  });
});
