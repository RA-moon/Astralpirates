import { describe, expect, it } from 'vitest';

import {
  isTestUserEmailCandidate,
  parseAllowlistEmails,
  parseTestUserBackfillArgs,
} from '@/src/scripts/backfillTestUserFlag.ts';

describe('backfillTestUserFlag helpers', () => {
  it('matches deterministic seeded test-email patterns', () => {
    expect(isTestUserEmailCandidate('test-roles.captain@astralpirates.com')).toBe(true);
    expect(isTestUserEmailCandidate('test-auth.crew@astralpirates.com')).toBe(true);
    expect(isTestUserEmailCandidate('captain@astralpirates.com')).toBe(false);
    expect(isTestUserEmailCandidate(null)).toBe(false);
  });

  it('parses allowlist files with comments and blank lines', () => {
    const allowlist = parseAllowlistEmails(`
# test accounts
test-custom@astralpirates.com

  TEST-MANUAL@astralpirates.com  
`);

    expect(Array.from(allowlist).sort()).toEqual([
      'test-custom@astralpirates.com',
      'test-manual@astralpirates.com',
    ]);
  });

  it('parses cli flags for apply/report/allowlist', () => {
    const options = parseTestUserBackfillArgs([
      '--apply',
      '--allowlist',
      './tmp/test-allowlist.txt',
      '--report',
      './tmp/test-user-backfill.json',
    ]);

    expect(options.apply).toBe(true);
    expect(options.allowlistPath).toMatch(/tmp\/test-allowlist\.txt$/);
    expect(options.reportPath).toMatch(/tmp\/test-user-backfill\.json$/);
  });

  it('throws on unknown flags', () => {
    expect(() => parseTestUserBackfillArgs(['--nope'])).toThrow(/unknown argument/i);
  });
});

