import { describe, it, expect } from 'vitest';

describe('domains/logs alias', () => {
  it(
    'resolves the barrel export',
    { timeout: 15000 },
    async () => {
      const mod = await import('~/domains/logs');
      expect(typeof mod.useLogbook).toBe('function');
      expect(typeof mod.useFlightPlans).toBe('function');
    },
  );
});
