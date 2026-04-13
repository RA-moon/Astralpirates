import { describe, expect, it } from 'vitest';

import HonorBadgeMedia from './HonorBadgeMedia';

describe('honor badge media access policy', () => {
  const createAccess = HonorBadgeMedia.access?.create;
  const updateAccess = HonorBadgeMedia.access?.update;
  const deleteAccess = HonorBadgeMedia.access?.delete;

  it('allows captains to create/update/delete badge media', async () => {
    expect(createAccess).toBeTypeOf('function');
    expect(updateAccess).toBeTypeOf('function');
    expect(deleteAccess).toBeTypeOf('function');

    const request = {
      req: {
        user: { id: 7, role: 'captain' },
      },
    } as any;

    expect(await createAccess?.(request)).toBe(true);
    expect(await updateAccess?.(request)).toBe(true);
    expect(await deleteAccess?.(request)).toBe(true);
  });

  it('denies non-captains for badge media mutations', async () => {
    expect(createAccess).toBeTypeOf('function');
    expect(updateAccess).toBeTypeOf('function');
    expect(deleteAccess).toBeTypeOf('function');

    const request = {
      req: {
        user: { id: 9, role: 'quartermaster' },
      },
    } as any;

    expect(await createAccess?.(request)).toBe(false);
    expect(await updateAccess?.(request)).toBe(false);
    expect(await deleteAccess?.(request)).toBe(false);
  });
});
