import { describe, expect, it } from 'vitest';

import { calculateElsaTopUp } from '@/src/workers/elsaTokenTopUp.ts';

describe('calculateElsaTopUp', () => {
  it('tops up captains to at least 10 tokens', () => {
    expect(calculateElsaTopUp('captain', 0)).toEqual({ shouldUpdate: true, nextTokens: 10 });
    expect(calculateElsaTopUp('captain', 9)).toEqual({ shouldUpdate: true, nextTokens: 10 });
    expect(calculateElsaTopUp('captain', 15)).toEqual({ shouldUpdate: false, nextTokens: 15 });
  });

  it('tops up crew members to at least one token', () => {
    expect(calculateElsaTopUp('swabbie', 0)).toEqual({ shouldUpdate: true, nextTokens: 1 });
    expect(calculateElsaTopUp('seamen', 4)).toEqual({ shouldUpdate: false, nextTokens: 4 });
  });

  it('normalises negative and string balances', () => {
    expect(calculateElsaTopUp('captain', -5)).toEqual({ shouldUpdate: true, nextTokens: 10 });
    expect(calculateElsaTopUp('swabbie', '2')).toEqual({ shouldUpdate: false, nextTokens: 2 });
    expect(calculateElsaTopUp(null, 'not-a-number')).toEqual({ shouldUpdate: true, nextTokens: 1 });
  });
});
