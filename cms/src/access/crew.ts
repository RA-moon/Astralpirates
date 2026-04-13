import type { Access, CollectionBeforeChangeHook, CollectionSlug, RelationshipField } from 'payload';

import { CAPTAIN_ROLE, CREW_ROLE_SET, isRoleAtLeast, type CrewRole } from '@astralpirates/shared/crewRoles';
import { can, type AuthorizationCapability } from '@astralpirates/shared/authorization';
import { getPermissionMinRole, type PermissionKey } from '@astralpirates/shared/permissions';
import { canEditFlightPlan as canEditFlightPlanMembership } from '@/app/api/_lib/flightPlanMembers';

export type CrewUser = {
  id?: string | number;
  role?: CrewRole | null;
  profileSlug?: string | null;
};

const normalizeId = (value: unknown): string | number | null => {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    const nested = (value as { id?: unknown }).id;
    if (typeof nested === 'string' || typeof nested === 'number') return nested;
  }
  return null;
};

export const isCaptain = (user: CrewUser | null | undefined): boolean => user?.role === CAPTAIN_ROLE;

export const hasCrewRole = (
  user: CrewUser | null | undefined,
): user is CrewUser & { role: CrewRole } => {
  if (!user) return false;
  const role = user.role;
  return role != null && CREW_ROLE_SET.has(role);
};

export const hasMinimumRole = (user: CrewUser | null | undefined, minimum: CrewRole): user is CrewUser =>
  hasCrewRole(user) && isRoleAtLeast(user.role, minimum);

export const crewCanPerform: Access = ({ req }) => hasCrewRole(req.user as CrewUser);

export const crewCanPerformAtLeast = (minimum: CrewRole): Access =>
  ({ req }) => hasMinimumRole(req.user as CrewUser, minimum);

const buildCapabilityActor = (
  user: CrewUser | null | undefined,
): {
  userId: string | number | null;
  isAuthenticated: boolean;
  websiteRole: CrewRole | null;
} => {
  const userId = normalizeId(user?.id);
  return {
    userId,
    isAuthenticated: userId != null,
    websiteRole: hasCrewRole(user) ? user.role : null,
  };
};

const hasCapability = (
  user: CrewUser | null | undefined,
  capability: AuthorizationCapability,
): boolean => {
  if (!hasCrewRole(user)) return false;
  return can(capability, {
    actor: buildCapabilityActor(user),
  });
};

const permissionMinRole = (permissionKey: PermissionKey, fallback: CrewRole): CrewRole => {
  try {
    return getPermissionMinRole(permissionKey) as CrewRole;
  } catch {
    return fallback;
  }
};

export const managePagesAccess: Access = ({ req }) =>
  hasCapability(req.user as CrewUser, 'editPage');
export const manageLogsAccess: Access = ({ req }) =>
  hasCapability(req.user as CrewUser, 'manageLogs');
export const flightPlanCreationGuard: Access = ({ req }) =>
  hasCapability(req.user as CrewUser, 'createFlightPlans');
export const getPermissionMinimumRole = permissionMinRole;

export const crewCanModifyOwned = (collectionSlug: CollectionSlug): Access =>
  async ({ req, id }) => {
    const user = req.user as CrewUser | undefined;
    if (!hasCrewRole(user)) return false;
    if (isCaptain(user)) return true;
    if (!id) return true;

    try {
      const doc = await req.payload.findByID({
        collection: collectionSlug,
        id,
        depth: 0,
        showHiddenFields: true,
      });
      const ownerId = normalizeId((doc as unknown as { owner?: unknown })?.owner);
      const userId = normalizeId(user?.id);
      return ownerId != null && userId != null && `${ownerId}` === `${userId}`;
    } catch (error) {
      req.payload.logger.warn({ err: error, id, collectionSlug }, 'Failed to evaluate ownership access');
      return false;
    }
  };

export const crewCanModifyOwnedAtLeast = (minimum: CrewRole, collectionSlug: CollectionSlug): Access =>
  async ({ req, id }) => {
    const user = req.user as CrewUser | undefined;
    if (!hasMinimumRole(user, minimum)) return false;
    if (isCaptain(user)) return true;
    if (!id) return true;

    try {
      const doc = await req.payload.findByID({
        collection: collectionSlug,
        id,
        depth: 0,
        showHiddenFields: true,
      });
      const ownerId = normalizeId((doc as unknown as { owner?: unknown })?.owner);
      const userId = normalizeId(user?.id);
      return ownerId != null && userId != null && `${ownerId}` === `${userId}`;
    } catch (error) {
      req.payload.logger.warn({ err: error, id, collectionSlug }, 'Failed to evaluate ownership access');
      return false;
    }
  };

export const crewCanEditFlightPlan: Access = async ({ req, id }) => {
  const user = req.user as CrewUser | undefined;
  if (!hasCrewRole(user)) return false;
  if (isCaptain(user)) return true;
  if (!id) return true;

  try {
    const canEdit = await canEditFlightPlanMembership({
      payload: req.payload,
      flightPlanId: id,
      userId: user?.id,
    });
    return canEdit;
  } catch (error) {
    req.payload.logger.warn(
      { err: error, id, userId: user?.id },
      'Failed to resolve flight plan membership access',
    );
    return false;
  }
};

export const assignOwnerOnChange: CollectionBeforeChangeHook = ({
  req,
  data,
  originalDoc,
  operation,
}) => {
  const user = req.user as CrewUser | undefined;
  if (!hasCrewRole(user)) {
    return data;
  }

  const currentOwner = normalizeId((data as Record<string, unknown>).owner);
  const fallbackOwner = normalizeId(originalDoc?.owner) ?? normalizeId(user?.id);

  if (operation === 'create') {
    return {
      ...data,
      owner: currentOwner ?? fallbackOwner,
    };
  }

  if (operation === 'update') {
    if (isCaptain(user)) {
      return {
        ...data,
        owner: currentOwner ?? fallbackOwner,
      };
    }

    return {
      ...data,
      owner: fallbackOwner,
    };
  }

  return data;
};

export const makeOwnerField = (): RelationshipField => ({
  name: 'owner',
  type: 'relationship' as const,
  relationTo: 'users',
  required: false,
  admin: {
    position: 'sidebar' as const,
    description: 'Crew member responsible for this entry.',
  },
});
