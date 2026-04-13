import { describe, expect, it } from 'vitest';

import TaskAttachments from './TaskAttachments';

describe('task attachment uploadedBy immutability', () => {
  const beforeValidate = TaskAttachments.hooks?.beforeValidate?.[0];

  it('keeps uploadedBy immutable on update', async () => {
    expect(beforeValidate).toBeTypeOf('function');
    const result = await beforeValidate?.({
      operation: 'update',
      data: {
        uploadedBy: 99,
      },
      originalDoc: {
        uploadedBy: 41,
      },
      req: {
        user: { id: 7 },
      },
    } as any);

    expect((result as any)?.uploadedBy).toBe(41);
  });

  it('forces uploadedBy to the authenticated user on create', async () => {
    expect(beforeValidate).toBeTypeOf('function');
    const result = await beforeValidate?.({
      operation: 'create',
      data: {
        uploadedBy: 99,
      },
      req: {
        user: { id: 7 },
      },
    } as any);

    expect((result as any)?.uploadedBy).toBe(7);
  });
});
