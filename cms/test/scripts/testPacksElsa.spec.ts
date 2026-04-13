import { describe, expect, it } from 'vitest';

import {
  resolvePackElsaRequirement,
  resolveRequiredElsaForRole,
  resolveTestPack,
  type TestPack,
} from '@/src/scripts/testPacks.ts';

describe('test pack ELSA requirements', () => {
  it('defaults creation/invite packs to two tokens per captain/crew', () => {
    const pack = resolveTestPack('roles');
    expect(resolvePackElsaRequirement(pack)).toEqual({ captain: 2, crew: 2 });
    expect(resolveRequiredElsaForRole(pack, 'captain')).toBe(2);
    expect(resolveRequiredElsaForRole(pack, 'swabbie')).toBe(2);
  });

  it('falls back to crew requirements when captain is not specified', () => {
    const pack: TestPack = {
      id: 'custom',
      title: 'Custom',
      summary: 'Custom',
      scenarios: [],
      requiredElsa: { crew: 3 },
    };

    expect(resolveRequiredElsaForRole(pack, 'captain')).toBe(3);
    expect(resolveRequiredElsaForRole(pack, 'seamen')).toBe(3);
  });

  it('returns zero when no requirements are defined', () => {
    const pack: TestPack = {
      id: 'minimal',
      title: 'Minimal',
      summary: 'Minimal',
      scenarios: [],
    };

    expect(resolveRequiredElsaForRole(pack, 'captain')).toBe(0);
  });
});
