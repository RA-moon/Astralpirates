import { describe, expect, it } from 'vitest';
import { resolveEffectiveAdminMode } from '@astralpirates/shared/adminMode';

import { applyAdminModeRollout } from './adminModeRollout';

describe('adminModeRollout', () => {
  it('disables both admin toggles when view rollout is disabled', () => {
    const mode = resolveEffectiveAdminMode({
      role: 'captain',
      adminViewRequested: true,
      adminEditRequested: true,
    });

    const result = applyAdminModeRollout(mode, {
      adminViewEnabled: false,
      adminEditEnabled: true,
      shadowMode: false,
    });

    expect(result.effectiveMode.adminViewEnabled).toBe(false);
    expect(result.effectiveMode.adminEditEnabled).toBe(false);
    expect(result.downgraded).toBe(true);
  });

  it('disables only admin edit when edit rollout is disabled', () => {
    const mode = resolveEffectiveAdminMode({
      role: 'captain',
      adminViewRequested: true,
      adminEditRequested: true,
    });

    const result = applyAdminModeRollout(mode, {
      adminViewEnabled: true,
      adminEditEnabled: false,
      shadowMode: false,
    });

    expect(result.effectiveMode.adminViewEnabled).toBe(true);
    expect(result.effectiveMode.adminEditEnabled).toBe(false);
    expect(result.downgraded).toBe(true);
  });

  it('enforces shadow mode by downgrading elevated admin state', () => {
    const mode = resolveEffectiveAdminMode({
      role: 'quartermaster',
      adminViewRequested: true,
    });

    const result = applyAdminModeRollout(mode, {
      adminViewEnabled: true,
      adminEditEnabled: true,
      shadowMode: true,
    });

    expect(result.effectiveMode.adminViewEnabled).toBe(false);
    expect(result.effectiveMode.adminEditEnabled).toBe(false);
    expect(result.downgraded).toBe(true);
  });
});
