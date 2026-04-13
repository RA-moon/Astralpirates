import {
  canReadWithAccessPolicy,
  normalizeAccessPolicy,
  normalizeFlightPlanMembershipRole,
  resolveFlightPlanPolicy,
  type AccessPolicy,
  type AccessPolicyInput,
  type FlightPlanAccessRole,
  type FlightPlanVisibilityLevel,
} from '@astralpirates/shared/accessPolicy';
import {
  canUseAdminReadOverride,
  type EffectiveAdminMode,
} from '@astralpirates/shared/adminMode';
import { can } from '@astralpirates/shared/authorization';
import { CREW_ROLE_SET, type CrewRole } from '@astralpirates/shared/crewRoles';

type UserLike =
  | {
      id?: unknown;
      role?: unknown;
    }
  | null
  | undefined;

const normalizeId = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    const normalized = `${value}`.trim();
    return normalized.length ? normalized : null;
  }
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normalizeId((value as { id?: unknown }).id);
  }
  return null;
};

const normalizeCrewRole = (value: unknown): CrewRole | null => {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toLowerCase();
  if (CREW_ROLE_SET.has(candidate as CrewRole)) {
    return candidate as CrewRole;
  }
  return null;
};

const resolveViewerFlightPlanRole = ({
  user,
  ownerId,
  membershipRole,
}: {
  user: UserLike;
  ownerId: unknown;
  membershipRole?: unknown;
}): FlightPlanAccessRole | null => {
  const normalizedOwnerId = normalizeId(ownerId);
  const normalizedUserId = normalizeId(user?.id);
  if (normalizedOwnerId && normalizedUserId && normalizedOwnerId === normalizedUserId) {
    return 'captain';
  }

  return normalizeFlightPlanMembershipRole(membershipRole);
};

const toAuthorizationMembershipRole = (
  value: FlightPlanAccessRole | null,
): 'owner' | 'crew' | 'passenger' | null => {
  if (value === 'captain') return 'owner';
  if (value === 'crew') return 'crew';
  if (value === 'passenger') return 'passenger';
  return null;
};

export const canUserReadCrewPolicy = ({
  policy,
  user,
  ownerId,
  fallbackPolicy,
  adminMode,
}: {
  policy?: AccessPolicyInput;
  user: UserLike;
  ownerId?: unknown;
  fallbackPolicy?: AccessPolicyInput;
  adminMode?: EffectiveAdminMode | null;
}): boolean => {
  const viewerUserId = normalizeId(user?.id);
  const normalizedOwnerId = normalizeId(ownerId);

  if (viewerUserId && canUseAdminReadOverride(adminMode)) {
    return true;
  }

  return canReadWithAccessPolicy(
    policy ?? null,
    {
      isAuthenticated: Boolean(user),
      userId: viewerUserId,
      ownerId: normalizedOwnerId,
      crewRole: normalizeCrewRole(user?.role),
      flightPlanRole: null,
    },
    {
      defaultRoleSpace: 'crew',
      fallbackPolicy: fallbackPolicy ?? { mode: 'public' },
    },
  );
};

export const resolveFlightPlanReadPolicy = ({
  policy,
  visibility,
  isPublic,
  publicContributions,
}: {
  policy?: AccessPolicyInput;
  visibility?: unknown;
  isPublic?: unknown;
  publicContributions?: unknown;
}): AccessPolicy =>
  resolveFlightPlanPolicy({
    policy,
    visibility,
    isPublic,
    publicContributions,
  });

export const canUserReadFlightPlan = ({
  user,
  ownerId,
  membershipRole,
  policy,
  visibility,
  isPublic,
  publicContributions,
  adminMode,
}: {
  user: UserLike;
  ownerId?: unknown;
  membershipRole?: unknown;
  policy?: AccessPolicyInput;
  visibility?: unknown;
  isPublic?: unknown;
  publicContributions?: unknown;
  adminMode?: EffectiveAdminMode | null;
}): boolean => {
  const viewerUserId = normalizeId(user?.id);
  const normalizedOwnerId = normalizeId(ownerId);
  const viewerRole = normalizeCrewRole(user?.role);
  const viewerFlightPlanRole = resolveViewerFlightPlanRole({
    user,
    ownerId,
    membershipRole,
  });
  const resolvedPolicy = resolveFlightPlanReadPolicy({
    policy,
    visibility,
    isPublic,
    publicContributions,
  });

  const canReadWithPolicy = canReadWithAccessPolicy(
    resolvedPolicy,
    {
      isAuthenticated: Boolean(user),
      userId: viewerUserId,
      ownerId: normalizedOwnerId,
      crewRole: viewerRole,
      flightPlanRole: viewerFlightPlanRole,
    },
    {
      defaultRoleSpace: 'flight-plan',
      fallbackPolicy: { mode: 'role', roleSpace: 'flight-plan', minimumRole: 'passenger' },
    },
  );

  return can(
    'readFlightPlan',
    {
      actor: {
        userId: viewerUserId,
        isAuthenticated: viewerUserId != null,
        websiteRole: viewerRole,
      },
      owner: {
        userId: normalizedOwnerId,
      },
      membership:
        viewerFlightPlanRole != null
          ? {
              role: toAuthorizationMembershipRole(viewerFlightPlanRole),
              status: 'accepted',
            }
          : undefined,
      toggles: {
        adminViewEnabled: adminMode?.adminViewEnabled ?? false,
        adminEditEnabled: adminMode?.adminEditEnabled ?? false,
      },
      attributes: {
        readFlightPlan: canReadWithPolicy,
      },
    },
  );
};

export const normalizeRoadmapVisibility = (
  value: unknown,
): FlightPlanVisibilityLevel | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'public' ||
    normalized === 'passengers' ||
    normalized === 'crew' ||
    normalized === 'captain'
  ) {
    return normalized as FlightPlanVisibilityLevel;
  }
  return null;
};

export const normalizeCrewAccessPolicy = (value: unknown): AccessPolicy | null =>
  normalizeAccessPolicy(value as any, { defaultRoleSpace: 'crew' });
