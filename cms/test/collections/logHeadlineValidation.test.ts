import { describe, expect, it, vi } from 'vitest';

import { ensureLogMetadata } from '../../src/collections/Logs';

const buildReq = (owner: Record<string, unknown> = { id: 42, callSign: 'Atlas' }) => ({
  payload: {
    findByID: vi.fn().mockResolvedValue(owner),
    logger: { warn: vi.fn() },
  },
});

describe('ensureLogMetadata', () => {
  it('falls back to the slug timestamp when headline input is blank', async () => {
    const data: Record<string, any> = {
      owner: 42,
      slug: '20250102030405',
      headline: '   ',
      body: 'System logs',
    };

    await ensureLogMetadata({
      data,
      originalDoc: null,
      req: buildReq(),
      operation: 'create',
    } as any);

    expect(data.headline).toBe('20250102030405');
    expect(data.title).toBe('Log 20250102030405 – 20250102030405');
    expect(data.path).toBe('logbook/20250102030405');
  });

  it('preserves a provided headline when available', async () => {
    const data: Record<string, any> = {
      owner: 7,
      slug: '20250301000000',
      headline: 'Atmosphere Restored',
      body: 'Oxygen nominal.',
    };

    await ensureLogMetadata({
      data,
      originalDoc: null,
      req: buildReq({ id: 7, callSign: 'Nova' }),
      operation: 'create',
    } as any);

    expect(data.headline).toBe('Atmosphere Restored');
    expect(data.title).toBe('Log 20250301000000 – Atmosphere Restored');
  });
});
