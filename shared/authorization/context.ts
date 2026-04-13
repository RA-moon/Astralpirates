import {
  CREW_ROLE_SET,
  type CrewRole,
} from '../crewRoles';

export type AuthorizationMembershipRole = 'owner' | 'crew' | 'passenger';
export type AuthorizationMembershipStatus = 'accepted' | 'pending' | 'declined' | 'revoked';

export type AuthorizationContext = {
  actor: {
    userId: string | number | null;
    isAuthenticated: boolean;
    websiteRole: CrewRole | null;
  };
  membership?: {
    role: AuthorizationMembershipRole | null;
    status: AuthorizationMembershipStatus | null;
  };
  owner?: {
    userId: string | number | null;
  };
  toggles?: {
    adminViewEnabled?: boolean;
    adminEditEnabled?: boolean;
  };
  attributes?: Record<string, boolean | string | number | null>;
};

export type AuthorizationContextInput = {
  actor?: {
    userId?: unknown;
    isAuthenticated?: unknown;
    websiteRole?: unknown;
  } | null;
  membership?: {
    role?: unknown;
    status?: unknown;
  } | null;
  owner?: {
    userId?: unknown;
  } | null;
  toggles?: {
    adminViewEnabled?: unknown;
    adminEditEnabled?: unknown;
  } | null;
  attributes?: Record<string, unknown> | null;
} | null | undefined;

const MEMBERSHIP_ROLE_SET = new Set<AuthorizationMembershipRole>(['owner', 'crew', 'passenger']);
const MEMBERSHIP_STATUS_SET = new Set<AuthorizationMembershipStatus>([
  'accepted',
  'pending',
  'declined',
  'revoked',
]);

const normalizeIdentifier = (value: unknown): string | number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normalizeIdentifier((value as { id?: unknown }).id);
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

const normalizeMembershipRole = (value: unknown): AuthorizationMembershipRole | null => {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toLowerCase();
  if (!MEMBERSHIP_ROLE_SET.has(candidate as AuthorizationMembershipRole)) {
    return null;
  }
  return candidate as AuthorizationMembershipRole;
};

const normalizeMembershipStatus = (value: unknown): AuthorizationMembershipStatus | null => {
  if (typeof value !== 'string') return null;
  const candidate = value.trim().toLowerCase();
  if (!MEMBERSHIP_STATUS_SET.has(candidate as AuthorizationMembershipStatus)) {
    return null;
  }
  return candidate as AuthorizationMembershipStatus;
};

const normalizeAttributes = (
  value: Record<string, unknown> | null | undefined,
): Record<string, boolean | string | number | null> | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value).filter(([, entryValue]) => {
    if (entryValue == null) return true;
    const valueType = typeof entryValue;
    return valueType === 'boolean' || valueType === 'string' || valueType === 'number';
  }) as Array<[string, boolean | string | number | null]>;
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
};

export const buildAuthorizationContext = (
  input: AuthorizationContextInput,
): AuthorizationContext => {
  const actorUserId = normalizeIdentifier(input?.actor?.userId);
  const actorRole = normalizeCrewRole(input?.actor?.websiteRole);
  const isAuthenticated =
    typeof input?.actor?.isAuthenticated === 'boolean'
      ? input.actor.isAuthenticated
      : actorUserId != null;

  const ownerId = normalizeIdentifier(input?.owner?.userId);
  const membershipRole = normalizeMembershipRole(input?.membership?.role);
  const membershipStatus = normalizeMembershipStatus(input?.membership?.status);

  const toggles = input?.toggles
    ? {
        adminViewEnabled: Boolean(input.toggles.adminViewEnabled),
        adminEditEnabled: Boolean(input.toggles.adminEditEnabled),
      }
    : undefined;

  return {
    actor: {
      userId: actorUserId,
      isAuthenticated,
      websiteRole: actorRole,
    },
    membership:
      membershipRole != null || membershipStatus != null
        ? {
            role: membershipRole,
            status: membershipStatus,
          }
        : undefined,
    owner:
      ownerId != null
        ? {
            userId: ownerId,
          }
        : undefined,
    toggles,
    attributes: normalizeAttributes(input?.attributes),
  };
};

export const idsEqual = (
  left: string | number | null | undefined,
  right: string | number | null | undefined,
): boolean => {
  if (left == null || right == null) return false;
  return String(left) === String(right);
};
