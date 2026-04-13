import { describe, expect, it } from 'vitest';

import { CAPTAIN_ROLE, DEFAULT_CREW_ROLE, resolveInviteeCrewRole } from '@astralpirates/shared/crewRoles';

describe('resolveInviteeCrewRole', () => {
  it('promotes captain-invited recruits to seamen', () => {
    expect(resolveInviteeCrewRole(CAPTAIN_ROLE)).toBe('seamen');
  });

  it('falls back to the default crew role for non-captain invites', () => {
    expect(resolveInviteeCrewRole('quartermaster')).toBe(DEFAULT_CREW_ROLE);
    expect(resolveInviteeCrewRole(null)).toBe(DEFAULT_CREW_ROLE);
  });
});
