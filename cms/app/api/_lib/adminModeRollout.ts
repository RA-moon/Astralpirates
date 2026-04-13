import type { EffectiveAdminMode } from '@astralpirates/shared/adminMode';

const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value !== 'string') return fallback;
  return TRUTHY_VALUES.has(value.trim().toLowerCase());
};

export type AdminModeRollout = {
  adminViewEnabled: boolean;
  adminEditEnabled: boolean;
  shadowMode: boolean;
};

export type AdminModeRolloutResult = {
  effectiveMode: EffectiveAdminMode;
  rollout: AdminModeRollout;
  downgraded: boolean;
};

export const resolveAdminModeRollout = (): AdminModeRollout => ({
  adminViewEnabled: parseBooleanEnv(process.env.ADMIN_MODE_VIEW_ENABLED, true),
  adminEditEnabled: parseBooleanEnv(process.env.ADMIN_MODE_EDIT_ENABLED, true),
  shadowMode: parseBooleanEnv(process.env.ADMIN_MODE_SHADOW_MODE, false),
});

export const applyAdminModeRollout = (
  mode: EffectiveAdminMode,
  rollout = resolveAdminModeRollout(),
): AdminModeRolloutResult => {
  if (rollout.shadowMode || !rollout.adminViewEnabled) {
    const effectiveMode: EffectiveAdminMode = {
      ...mode,
      adminViewEnabled: false,
      adminEditEnabled: false,
    };
    return {
      effectiveMode,
      rollout,
      downgraded: mode.adminViewEnabled || mode.adminEditEnabled,
    };
  }

  if (!rollout.adminEditEnabled && mode.adminEditEnabled) {
    const effectiveMode: EffectiveAdminMode = {
      ...mode,
      adminEditEnabled: false,
    };
    return {
      effectiveMode,
      rollout,
      downgraded: true,
    };
  }

  return {
    effectiveMode: mode,
    rollout,
    downgraded: false,
  };
};
