import { describe, expect, it } from 'vitest';

import { orderClauseForSort } from '@/app/api/_lib/comments/store';

describe('orderClauseForSort', () => {
  it('uses balanced vote counts for controversial sorting', () => {
    const clause = orderClauseForSort('controversial');

    expect(clause).toContain('LEAST');
    expect(clause).toContain('up_count');
    expect(clause).toContain('down_count');
  });

  it('uses last activity for best sorting', () => {
    const clause = orderClauseForSort('best');
    expect(clause).toContain('last_activity_at');
  });
});
