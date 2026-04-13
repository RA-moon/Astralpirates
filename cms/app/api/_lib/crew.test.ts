import { describe, expect, it } from 'vitest';

import { normalizeCrewRole, resolveCrewUserIdsByRoles } from './crew';

describe('crew helpers', () => {
  it('normalizes known crew roles and rejects unknown values', () => {
    expect(normalizeCrewRole(' Captain ')).toBe('captain');
    expect(normalizeCrewRole('seamen')).toBe('seamen');
    expect(normalizeCrewRole('swabbie')).toBe('swabbie');
    expect(normalizeCrewRole('invalid-role')).toBeNull();
    expect(normalizeCrewRole(null)).toBeNull();
  });

  it('resolves user ids by role across paginated pages', async () => {
    const pages = [
      {
        docs: [{ id: 11 }, { id: 12 }],
        page: 1,
        totalPages: 2,
      },
      {
        docs: [{ id: 21 }],
        page: 2,
        totalPages: 2,
      },
    ];

    let calls = 0;
    const payload = {
      find: async () => {
        const result = pages[calls];
        calls += 1;
        return result;
      },
    };

    const ids = await resolveCrewUserIdsByRoles(payload as any, ['captain', 'quartermaster']);
    expect(ids).toEqual([11, 12, 21]);
    expect(calls).toBe(2);
  });

  it('returns an empty list when no roles are valid', async () => {
    const payload = {
      find: async () => ({ docs: [{ id: 1 }], page: 1, totalPages: 1 }),
    };
    const ids = await resolveCrewUserIdsByRoles(payload as any, ['not-a-role' as any]);
    expect(ids).toEqual([]);
  });
});
