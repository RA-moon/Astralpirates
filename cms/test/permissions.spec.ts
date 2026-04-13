import { describe, it, expect } from 'vitest';

import { CREW_ROLE_SET } from '@astralpirates/shared/crewRoles';
import { PERMISSIONS, getPermissionMinRole } from '@astralpirates/shared/permissions';

const permissionEntries = Object.entries(PERMISSIONS);

describe('shared permissions registry', () => {
  it('only references valid crew roles', () => {
    const invalid = permissionEntries
      .filter(([, rule]) => !CREW_ROLE_SET.has(rule.minRole as any))
      .map(([key, rule]) => ({ key, role: rule.minRole }));

    expect(invalid).toEqual([]);
  });

  it('exposes consistent minRole helpers', () => {
    permissionEntries.forEach(([key, rule]) => {
      expect(getPermissionMinRole(key as keyof typeof PERMISSIONS)).toBe(rule.minRole);
    });
  });
});
