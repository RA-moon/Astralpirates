import { describe, expect, it } from 'vitest';

import FlightPlans from './FlightPlans';

describe('FlightPlans beforeValidate access normalization', () => {
  const beforeValidate = FlightPlans.hooks?.beforeValidate?.[1];

  it('preserves existing access/collaboration flags on sparse updates', async () => {
    expect(beforeValidate).toBeTypeOf('function');

    const result = await beforeValidate?.({
      operation: 'update',
      data: {
        title: 'Updated mission title',
      },
      originalDoc: {
        visibility: 'crew',
        accessPolicy: { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'crew' },
        mediaVisibility: 'crew_only',
        publicContributions: true,
        passengersCanCommentOnTasks: true,
      },
    } as any);

    expect((result as any)?.visibility).toBe('crew');
    expect((result as any)?.accessPolicy).toEqual({
      mode: 'role',
      roleSpace: 'flight-plan',
      minimumRole: 'crew',
    });
    expect((result as any)?.mediaVisibility).toBe('crew_only');
    expect((result as any)?.isPublic).toBe(false);
    expect((result as any)?.publicContributions).toBe(true);
    expect((result as any)?.passengersCanCommentOnTasks).toBe(true);
  });

  it('defaults collaboration flags on create when not provided', async () => {
    expect(beforeValidate).toBeTypeOf('function');

    const result = await beforeValidate?.({
      operation: 'create',
      data: {
        visibility: 'public',
      },
    } as any);

    expect((result as any)?.visibility).toBe('public');
    expect((result as any)?.isPublic).toBe(true);
    expect((result as any)?.publicContributions).toBe(false);
    expect((result as any)?.passengersCanCommentOnTasks).toBe(false);
  });
});
