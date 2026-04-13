import { afterEach, describe, expect, it, vi } from 'vitest';

import Avatars, { formatAvatarFilename } from './Avatars';

afterEach(() => {
  vi.useRealTimers();
});

describe('avatar uploadedBy immutability', () => {
  const beforeValidate = Avatars.hooks?.beforeValidate?.[0];

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

describe('avatar access policy', () => {
  const updateAccess = Avatars.access?.update;

  it('allows captains to modify any avatar', async () => {
    expect(updateAccess).toBeTypeOf('function');
    const allowed = await updateAccess?.({
      req: {
        user: { id: 8, role: 'captain' },
      },
      doc: {
        uploadedBy: 41,
      },
    } as any);
    expect(allowed).toBe(true);
  });

  it('allows owners to modify their own avatar', async () => {
    expect(updateAccess).toBeTypeOf('function');
    const allowed = await updateAccess?.({
      req: {
        user: { id: 41, role: 'swabbie' },
      },
      doc: {
        uploadedBy: 41,
      },
    } as any);
    expect(allowed).toBe(true);
  });

  it('denies non-owner, non-captain avatar modifications', async () => {
    expect(updateAccess).toBeTypeOf('function');
    const allowed = await updateAccess?.({
      req: {
        user: { id: 9, role: 'swabbie' },
      },
      doc: {
        uploadedBy: 41,
      },
    } as any);
    expect(allowed).toBe(false);
  });
});

describe('avatar filename schema', () => {
  it('uses deterministic key segments with user id + UTC year/month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T12:00:00.000Z'));

    const filename = formatAvatarFilename({
      originalFilename: 'Pasted Graphic 3.JPG',
      req: {
        user: {
          id: 42,
          callSign: 'Test Captain',
        },
      },
    });

    expect(filename).toMatch(
      /^public\/durable\/clean\/profile\/user\/42\/rp-forever\/2026\/03\/pasted-graphic-3-[a-f0-9]{16}-original\.jpg$/,
    );
  });

  it('preserves supported video/model extensions in object keys', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-31T12:00:00.000Z'));

    const filename = formatAvatarFilename({
      originalFilename: 'pilot-loop.mp4',
      req: {
        user: {
          id: 9,
          callSign: 'Pilot',
        },
      },
    });

    expect(filename).toMatch(
      /^public\/durable\/clean\/profile\/user\/9\/rp-forever\/2026\/03\/pilot-loop-[a-f0-9]{16}-original\.mp4$/,
    );
  });
});
