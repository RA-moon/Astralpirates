import { describe, it, expect } from 'vitest';

import type { HonorBadgeRecord } from '../honorBadges';
import { evaluateAutomaticHonorBadges, syncHonorBadges } from '../honorBadges';

describe('honorBadges utilities', () => {
  it('awards the Pioneer badge automatically for 2025 enlistment dates', () => {
    const awards = evaluateAutomaticHonorBadges({
      createdAt: '2025-05-20T12:00:00.000Z',
    });

    expect(awards).toHaveLength(1);
    expect(awards[0]).toMatchObject({
      code: 'pioneer',
      source: 'automatic',
    });
  });

  it('adds automatic badges when eligible', () => {
    const result = syncHonorBadges({
      draft: {
        createdAt: '2025-03-18T00:00:00.000Z',
      },
      previous: {
        createdAt: '2025-03-18T00:00:00.000Z',
        honorBadges: [],
      } as any,
    });

    expect(result.some((entry) => entry.code === 'pioneer' && entry.source === 'automatic')).toBe(true);
  });

  it('keeps manual overrides without duplicating codes', () => {
    const manualBadge: HonorBadgeRecord = {
      code: 'pioneer',
      awardedAt: '2024-02-01T00:00:00.000Z',
      source: 'manual',
      note: 'Test override',
    };

    const result = syncHonorBadges({
      draft: {
        createdAt: '2025-01-10T00:00:00.000Z',
      },
      previous: {
        createdAt: '2025-01-10T00:00:00.000Z',
        honorBadges: [manualBadge],
      } as any,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: 'manual',
      note: 'Test override',
    });
  });
});
