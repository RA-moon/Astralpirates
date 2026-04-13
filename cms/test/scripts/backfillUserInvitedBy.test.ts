import { describe, expect, it } from 'vitest';

import {
  needsInvitedByBackfill,
  parseInvitedByBackfillArgs,
} from '@/src/scripts/backfillUserInvitedBy.ts';

describe('backfillUserInvitedBy helpers', () => {
  it('marks non-captain users without inviter as backfill candidates', () => {
    expect(needsInvitedByBackfill('swabbie', null)).toBe(true);
    expect(needsInvitedByBackfill('seamen', undefined)).toBe(true);
  });

  it('skips captains and users that already have inviter references', () => {
    expect(needsInvitedByBackfill('captain', null)).toBe(false);
    expect(needsInvitedByBackfill('swabbie', 42)).toBe(false);
    expect(needsInvitedByBackfill('swabbie', { id: 42 })).toBe(false);
  });

  it('parses apply, report, and captain-id flags', () => {
    const options = parseInvitedByBackfillArgs([
      '--apply',
      '--captain-id',
      '17',
      '--report',
      './tmp/invited-by-backfill.json',
    ]);

    expect(options.apply).toBe(true);
    expect(options.captainId).toBe(17);
    expect(options.reportPath).toMatch(/tmp\/invited-by-backfill\.json$/);
  });

  it('throws on unknown flags', () => {
    expect(() => parseInvitedByBackfillArgs(['--mystery-flag'])).toThrow(/unknown argument/i);
  });
});
