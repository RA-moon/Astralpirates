import { CREW_ROLE_SET, isRoleAtLeast, type CrewRole } from './crewRoles';

export const ADMIN_MODE_HEADERS = Object.freeze({
  view: 'x-admin-view-enabled',
  edit: 'x-admin-edit-enabled',
});

export type AdminModeEligibility = {
  canUseAdminView: boolean;
  canUseAdminEdit: boolean;
};

export type EffectiveAdminMode = {
  adminViewEnabled: boolean;
  adminEditEnabled: boolean;
  eligibility: AdminModeEligibility;
};

export type ResolveAdminModeInput = {
  role?: unknown;
  adminViewRequested?: unknown;
  adminEditRequested?: unknown;
};

const trueValues = new Set(['1', 'true', 'on', 'yes']);

export const normalizeCrewRole = (value: unknown): CrewRole | null => {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toLowerCase();
  if (!candidate) return null;
  if (!CREW_ROLE_SET.has(candidate as CrewRole)) return null;
  return candidate as CrewRole;
};

export const parseAdminModeFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value !== 'string') return false;
  return trueValues.has(value.trim().toLowerCase());
};

export const resolveAdminModeEligibility = (role: unknown): AdminModeEligibility => {
  const normalizedRole = normalizeCrewRole(role);
  if (!normalizedRole) {
    return {
      canUseAdminView: false,
      canUseAdminEdit: false,
    };
  }

  return {
    canUseAdminView: isRoleAtLeast(normalizedRole, 'quartermaster'),
    canUseAdminEdit: normalizedRole === 'captain',
  };
};

export const resolveEffectiveAdminMode = ({
  role,
  adminViewRequested,
  adminEditRequested,
}: ResolveAdminModeInput): EffectiveAdminMode => {
  const eligibility = resolveAdminModeEligibility(role);
  const adminViewEnabled = eligibility.canUseAdminView && parseAdminModeFlag(adminViewRequested);
  const adminEditEnabled =
    adminViewEnabled && eligibility.canUseAdminEdit && parseAdminModeFlag(adminEditRequested);

  return {
    adminViewEnabled,
    adminEditEnabled,
    eligibility,
  };
};

export const canUseAdminReadOverride = (mode: EffectiveAdminMode | null | undefined): boolean =>
  Boolean(mode?.adminViewEnabled && mode?.eligibility?.canUseAdminView);

export const canUseAdminEditOverride = (mode: EffectiveAdminMode | null | undefined): boolean =>
  Boolean(mode?.adminEditEnabled && mode?.eligibility?.canUseAdminEdit && mode?.adminViewEnabled);
