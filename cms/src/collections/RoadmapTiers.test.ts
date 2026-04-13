import { describe, expect, it } from 'vitest';

import RoadmapTiers from './RoadmapTiers';

describe('RoadmapTiers beforeValidate normalization', () => {
  const beforeValidate = RoadmapTiers.hooks?.beforeValidate?.[0];

  it('preserves tier metadata and items on sparse updates', async () => {
    expect(beforeValidate).toBeTypeOf('function');

    const result = await beforeValidate?.({
      operation: 'update',
      data: {
        statusSummary: '1 active, 2 queued',
      },
      originalDoc: {
        tierId: 'tier2',
        tier: 'tier2',
        title: 'Tier 2',
        description: 'Execution',
        focus: 'Product',
        statusSummary: 'old',
        items: [
          {
            code: 'T2.01',
            title: 'Ship feature',
            summary: 'Summary',
            status: 'active',
            cloudStatus: 'healthy',
            referenceLabel: 'Doc',
            referenceUrl: 'https://example.com/doc',
            plan: {
              id: 'plan-1',
              title: 'Plan 1',
              owner: 'Crew',
              path: 'docs/planning/plan-1.md',
              status: 'active',
              cloudStatus: 'healthy',
            },
          },
        ],
      },
    } as any);

    expect((result as any)?.tierId).toBe('tier2');
    expect((result as any)?.tier).toBe('tier2');
    expect((result as any)?.title).toBe('Tier 2');
    expect((result as any)?.statusSummary).toBe('1 active, 2 queued');
    expect((result as any)?.items).toHaveLength(1);
    expect((result as any)?.items?.[0]).toMatchObject({
      code: 'T2.01',
      title: 'Ship feature',
      status: 'active',
      cloudStatus: 'healthy',
    });
  });
});
