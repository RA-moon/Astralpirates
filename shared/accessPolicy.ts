import {
  DEFAULT_CREW_ROLE,
  CREW_ROLE_SET,
  isRoleAtLeast,
  type CrewRole,
} from './crewRoles';

export const ACCESS_POLICY_MODES = ['public', 'role', 'private'] as const;
export type AccessPolicyMode = (typeof ACCESS_POLICY_MODES)[number];

export const ACCESS_ROLE_SPACES = ['crew', 'flight-plan'] as const;
export type AccessRoleSpace = (typeof ACCESS_ROLE_SPACES)[number];

export const FLIGHT_PLAN_ACCESS_ROLES = ['captain', 'crew', 'passenger'] as const;
export type FlightPlanAccessRole = (typeof FLIGHT_PLAN_ACCESS_ROLES)[number];

export type PublicAccessPolicy = {
  mode: 'public';
};

export type PrivateAccessPolicy = {
  mode: 'private';
};

export type CrewRoleAccessPolicy = {
  mode: 'role';
  roleSpace?: 'crew';
  minimumRole: CrewRole;
};

export type FlightPlanRoleAccessPolicy = {
  mode: 'role';
  roleSpace: 'flight-plan';
  minimumRole: FlightPlanAccessRole;
};

export type AccessPolicy =
  | PublicAccessPolicy
  | PrivateAccessPolicy
  | CrewRoleAccessPolicy
  | FlightPlanRoleAccessPolicy;

export type AccessPolicyInput = {
  mode?: unknown;
  roleSpace?: unknown;
  minimumRole?: unknown;
  minimumCrewRole?: unknown;
  minimumFlightPlanRole?: unknown;
} | null | undefined;

export type AccessPolicyViewer = {
  isAuthenticated: boolean;
  userId?: string | number | null;
  ownerId?: string | number | null;
  crewRole?: CrewRole | null;
  flightPlanRole?: FlightPlanAccessRole | null;
};

export type FlightPlanVisibilityLevel = 'public' | 'passengers' | 'crew' | 'captain';

export const DEFAULT_ACCESS_POLICY: Readonly<AccessPolicy> = Object.freeze({ mode: 'public' });

const roleSpaceSet: ReadonlySet<AccessRoleSpace> = new Set(ACCESS_ROLE_SPACES);
const flightPlanRoleSet: ReadonlySet<FlightPlanAccessRole> = new Set(FLIGHT_PLAN_ACCESS_ROLES);

const trimString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const normalizeRoleSpace = (value: unknown): AccessRoleSpace | null => {
  const candidate = trimString(value).toLowerCase();
  if (roleSpaceSet.has(candidate as AccessRoleSpace)) {
    return candidate as AccessRoleSpace;
  }
  return null;
};

const normalizeCrewRole = (value: unknown): CrewRole | null => {
  const candidate = trimString(value).toLowerCase();
  if (CREW_ROLE_SET.has(candidate as CrewRole)) {
    return candidate as CrewRole;
  }
  return null;
};

const normalizeFlightPlanRole = (value: unknown): FlightPlanAccessRole | null => {
  const candidate = trimString(value).toLowerCase();
  if (flightPlanRoleSet.has(candidate as FlightPlanAccessRole)) {
    return candidate as FlightPlanAccessRole;
  }
  if (candidate === 'guest') {
    return 'passenger';
  }
  if (candidate === 'owner') {
    return 'captain';
  }
  return null;
};

const normalizeMinimumRole = (
  value: AccessPolicyInput,
  roleSpace: AccessRoleSpace,
): CrewRole | FlightPlanAccessRole | null => {
  const input = value && typeof value === 'object' ? value : null;
  if (!input) return null;

  const primary = input.minimumRole;
  if (roleSpace === 'crew') {
    const crewPrimary = normalizeCrewRole(primary);
    if (crewPrimary) return crewPrimary;
    const crewFallback = normalizeCrewRole(input.minimumCrewRole);
    if (crewFallback) return crewFallback;
    return null;
  }

  const flightPrimary = normalizeFlightPlanRole(primary);
  if (flightPrimary) return flightPrimary;
  const flightFallback = normalizeFlightPlanRole(input.minimumFlightPlanRole);
  if (flightFallback) return flightFallback;
  return null;
};

export const normalizeAccessPolicy = (
  value: AccessPolicyInput,
  options: {
    defaultRoleSpace?: AccessRoleSpace;
  } = {},
): AccessPolicy | null => {
  if (!value || typeof value !== 'object') return null;

  const mode = trimString(value.mode).toLowerCase() as AccessPolicyMode;
  if (!mode || !ACCESS_POLICY_MODES.includes(mode)) {
    return null;
  }

  if (mode === 'public') {
    return { mode: 'public' };
  }

  if (mode === 'private') {
    return { mode: 'private' };
  }

  const roleSpace =
    normalizeRoleSpace(value.roleSpace) ?? options.defaultRoleSpace ?? 'crew';
  const minimumRole = normalizeMinimumRole(value, roleSpace);

  if (roleSpace === 'flight-plan') {
    if (!minimumRole || !flightPlanRoleSet.has(minimumRole as FlightPlanAccessRole)) {
      return null;
    }

    return {
      mode: 'role',
      roleSpace: 'flight-plan',
      minimumRole: minimumRole as FlightPlanAccessRole,
    };
  }

  if (!minimumRole || !CREW_ROLE_SET.has(minimumRole as CrewRole)) {
    return null;
  }

  return {
    mode: 'role',
    roleSpace: 'crew',
    minimumRole: minimumRole as CrewRole,
  };
};

export const resolveEffectiveAccessPolicy = ({
  policy,
  parentPolicy,
  fallbackPolicy,
  defaultRoleSpace,
}: {
  policy?: AccessPolicyInput;
  parentPolicy?: AccessPolicyInput;
  fallbackPolicy?: AccessPolicyInput;
  defaultRoleSpace?: AccessRoleSpace;
}): AccessPolicy => {
  const resolved =
    normalizeAccessPolicy(policy, { defaultRoleSpace }) ??
    normalizeAccessPolicy(parentPolicy, { defaultRoleSpace }) ??
    normalizeAccessPolicy(fallbackPolicy, { defaultRoleSpace });

  return resolved ?? DEFAULT_ACCESS_POLICY;
};

const normalizeIdentity = (value: string | number | null | undefined): string | null => {
  if (value == null) return null;
  const normalized = `${value}`.trim();
  return normalized.length ? normalized : null;
};

const flightPlanRoleIndex: Readonly<Record<FlightPlanAccessRole, number>> = Object.freeze({
  captain: 0,
  crew: 1,
  passenger: 2,
});

export const isFlightPlanRoleAtLeast = (
  role: FlightPlanAccessRole | null | undefined,
  minimum: FlightPlanAccessRole,
): boolean => {
  if (!role || !minimum) return false;
  const roleIndex = flightPlanRoleIndex[role];
  const minimumIndex = flightPlanRoleIndex[minimum];
  if (roleIndex === undefined || minimumIndex === undefined) return false;
  return roleIndex <= minimumIndex;
};

export const canReadWithAccessPolicy = (
  policyInput: AccessPolicyInput,
  viewer: AccessPolicyViewer,
  options: {
    defaultRoleSpace?: AccessRoleSpace;
    fallbackPolicy?: AccessPolicyInput;
  } = {},
): boolean => {
  const policy = resolveEffectiveAccessPolicy({
    policy: policyInput,
    fallbackPolicy: options.fallbackPolicy,
    defaultRoleSpace: options.defaultRoleSpace,
  });

  if (policy.mode === 'public') {
    return true;
  }

  if (policy.mode === 'private') {
    if (!viewer.isAuthenticated) return false;
    const ownerId = normalizeIdentity(viewer.ownerId);
    const userId = normalizeIdentity(viewer.userId);
    return ownerId != null && userId != null && ownerId === userId;
  }

  if (!viewer.isAuthenticated) {
    return false;
  }

  if (policy.roleSpace === 'flight-plan') {
    return isFlightPlanRoleAtLeast(viewer.flightPlanRole, policy.minimumRole);
  }

  return isRoleAtLeast(viewer.crewRole, policy.minimumRole);
};

export const resolveFlightPlanPolicy = ({
  policy,
  visibility,
  isPublic,
  publicContributions,
}: {
  policy?: AccessPolicyInput;
  visibility?: unknown;
  isPublic?: unknown;
  publicContributions?: unknown;
}): AccessPolicy => {
  const explicit = normalizeAccessPolicy(policy, { defaultRoleSpace: 'flight-plan' });
  if (explicit) return explicit;

  const visibilityValue = trimString(visibility).toLowerCase();
  if (visibilityValue === 'public') {
    return { mode: 'public' };
  }
  if (visibilityValue === 'passengers') {
    return { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'passenger' };
  }
  if (visibilityValue === 'crew') {
    return { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'crew' };
  }
  if (visibilityValue === 'captain') {
    return { mode: 'private' };
  }

  if (isPublic === true) {
    return { mode: 'public' };
  }

  if (publicContributions === true) {
    // Legacy compatibility: this used to expose missions to any authenticated crew account.
    return {
      mode: 'role',
      roleSpace: 'crew',
      minimumRole: DEFAULT_CREW_ROLE,
    };
  }

  // Legacy default: private missions were visible to accepted passengers and above.
  return { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'passenger' };
};

export const deriveFlightPlanVisibility = (policyInput: AccessPolicyInput): FlightPlanVisibilityLevel => {
  const policy = normalizeAccessPolicy(policyInput, { defaultRoleSpace: 'flight-plan' });
  if (!policy) return 'passengers';

  if (policy.mode === 'public') return 'public';
  if (policy.mode === 'private') return 'captain';

  if (policy.roleSpace === 'flight-plan') {
    if (policy.minimumRole === 'crew') return 'crew';
    if (policy.minimumRole === 'captain') return 'captain';
    return 'passengers';
  }

  return 'passengers';
};

export const normalizeFlightPlanMembershipRole = (value: unknown): FlightPlanAccessRole | null =>
  normalizeFlightPlanRole(value);
