import { describe, expect, it } from 'vitest';

import Plans from './Plans';

describe('Plans beforeValidate normalization', () => {
  const beforeValidate = Plans.hooks?.beforeValidate?.[0];

  it('preserves required values on sparse updates', async () => {
    expect(beforeValidate).toBeTypeOf('function');

    const result = await beforeValidate?.({
      operation: 'update',
      data: {
        status: 'active',
      },
      originalDoc: {
        planId: 'T2.37',
        slug: 't2-37-ui-size-system',
        title: 'Unified UI Size System',
        owner: 'Platform',
        tier: 'tier2',
        status: 'queued',
        cloudStatus: 'pending',
        summary: 'Initial summary',
        lastUpdated: '2026-04-01',
        path: 'docs/planning/unified-ui-size-system.md',
        links: [{ label: 'Doc', url: 'https://example.com/doc' }],
      },
    } as any);

    expect((result as any)?.planId).toBe('T2.37');
    expect((result as any)?.slug).toBe('t2-37-ui-size-system');
    expect((result as any)?.title).toBe('Unified UI Size System');
    expect((result as any)?.owner).toBe('Platform');
    expect((result as any)?.tier).toBe('tier2');
    expect((result as any)?.status).toBe('active');
    expect((result as any)?.cloudStatus).toBe('pending');
    expect((result as any)?.links).toEqual([{ label: 'Doc', url: 'https://example.com/doc' }]);
  });

  it('applies defaults on create when optional fields are missing', async () => {
    expect(beforeValidate).toBeTypeOf('function');

    const result = await beforeValidate?.({
      operation: 'create',
      data: {
        title: 'New plan',
      },
    } as any);

    expect((result as any)?.planId).toBe('New plan');
    expect((result as any)?.slug).toBe('New plan');
    expect((result as any)?.tier).toBe('tier2');
    expect((result as any)?.status).toBe('queued');
    expect((result as any)?.cloudStatus).toBe('pending');
  });
});
