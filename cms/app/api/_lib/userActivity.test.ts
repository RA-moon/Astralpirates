import { describe, expect, it, vi } from 'vitest';

import { touchUserActivity } from './userActivity';

describe('touchUserActivity', () => {
  it('updates users.lastActiveAt with overrideAccess', async () => {
    let called = false;
    let seen: unknown = null;
    const payload = {
      update: async (args: unknown) => {
        called = true;
        seen = args;
        return {};
      },
    };

    await touchUserActivity(payload, 42, 'log creation');

    expect(called).toBe(true);
    const input = seen as {
      collection: string;
      id: number;
      data: { lastActiveAt: string };
      overrideAccess: boolean;
    };
    expect(input.collection).toBe('users');
    expect(input.id).toBe(42);
    expect(input.overrideAccess).toBe(true);
    expect(input.data.lastActiveAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('logs warning context when update fails', async () => {
    const warn = vi.fn<(meta: unknown, message: string) => void>();
    const payload = {
      update: async () => {
        throw new Error('boom');
      },
      logger: {
        warn,
      },
    };

    await touchUserActivity(payload, 'user-7', 'flight plan creation');

    expect(warn).toHaveBeenCalledTimes(1);
    const call = warn.mock.calls[0];
    if (!call) {
      throw new Error('Expected warning callback to be called');
    }
    const [metaValue, message] = call;
    expect(message).toBe('Failed to stamp user activity after flight plan creation');
    const meta = metaValue as { err?: unknown; userId?: unknown };
    expect(meta.userId).toBe('user-7');
    expect(meta.err).toBeInstanceOf(Error);
    expect((meta.err as Error).message).toBe('boom');
  });
});
