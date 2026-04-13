import {
  isRoleAtLeast,
  type CrewRole,
} from '../crewRoles';
import { getPermissionMinRole } from '../permissions';
import type { AuthorizationCapability } from './capabilities';
import {
  buildAuthorizationContext,
  idsEqual,
  type AuthorizationContext,
} from './context';

type AuthorizationResource =
  | {
      minimumRole?: unknown;
      allowedRoles?: Iterable<unknown> | null;
      allowedUserIds?: Iterable<unknown> | null;
    }
  | null
  | undefined;

type AuthorizationBinding = (
  context: AuthorizationContext,
  resource?: AuthorizationResource,
) => boolean;

const isAuthenticated = (context: AuthorizationContext): boolean =>
  Boolean(context.actor.isAuthenticated && context.actor.userId != null);

const isOwner = (context: AuthorizationContext): boolean =>
  idsEqual(context.actor.userId, context.owner?.userId ?? null);

const canAdminReadAllContent = (context: AuthorizationContext): boolean =>
  isRoleAtLeast(context.actor.websiteRole, 'quartermaster') &&
  context.toggles?.adminViewEnabled === true;

const canAdminEditAllContent = (context: AuthorizationContext): boolean =>
  isRoleAtLeast(context.actor.websiteRole, 'captain') &&
  context.toggles?.adminViewEnabled === true &&
  context.toggles?.adminEditEnabled === true;

const normalizeAllowedRoles = (input: Iterable<unknown> | null | undefined): Set<CrewRole> => {
  const roles = new Set<CrewRole>();
  if (!input) return roles;
  for (const value of input) {
    if (typeof value !== 'string') continue;
    const candidate = value.trim().toLowerCase();
    try {
      if (isRoleAtLeast(candidate as CrewRole, candidate as CrewRole)) {
        roles.add(candidate as CrewRole);
      }
    } catch {
      continue;
    }
  }
  return roles;
};

const normalizeAllowedUserIds = (input: Iterable<unknown> | null | undefined): Set<string> => {
  const values = new Set<string>();
  if (!input) return values;
  for (const value of input) {
    if (value == null) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      values.add(String(value));
      continue;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        values.add(trimmed);
      }
    }
  }
  return values;
};

const normalizeMinimumRole = (value: unknown, fallback: CrewRole): CrewRole => {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim().toLowerCase();
  try {
    if (isRoleAtLeast(candidate as CrewRole, candidate as CrewRole)) {
      return candidate as CrewRole;
    }
  } catch {
    return fallback;
  }
  return fallback;
};

const bindings: Readonly<Record<AuthorizationCapability, AuthorizationBinding>> = Object.freeze({
  readPage: (context) => canAdminReadAllContent(context) || Boolean(context.attributes?.readPage === true),
  editPage: (context, resource) => {
    if (!isAuthenticated(context)) return false;
    if (canAdminEditAllContent(context)) return true;

    const actorRole = context.actor.websiteRole;
    if (!actorRole) return false;

    const actorId = context.actor.userId != null ? String(context.actor.userId) : null;
    const allowedUserIds = normalizeAllowedUserIds(resource?.allowedUserIds);
    if (actorId && allowedUserIds.has(actorId)) {
      return true;
    }

    const allowedRoles = normalizeAllowedRoles(resource?.allowedRoles);
    if (allowedRoles.size > 0 && allowedRoles.has(actorRole)) {
      return true;
    }

    const minimumRole = normalizeMinimumRole(
      resource?.minimumRole,
      getPermissionMinRole('managePages'),
    );
    return isRoleAtLeast(actorRole, minimumRole);
  },
  manageLogs: (context) =>
    isAuthenticated(context) && isRoleAtLeast(context.actor.websiteRole, getPermissionMinRole('manageLogs')),
  createFlightPlans: (context) =>
    isAuthenticated(context) &&
    isRoleAtLeast(context.actor.websiteRole, getPermissionMinRole('createFlightPlans')),
  readFlightPlan: (context) =>
    canAdminReadAllContent(context) || Boolean(context.attributes?.readFlightPlan === true),
  editFlightPlan: (context) =>
    canAdminEditAllContent(context) || Boolean(context.attributes?.editFlightPlan === true),
  manageFlightPlanLifecycle: (context) =>
    isAuthenticated(context) &&
    (isOwner(context) || isRoleAtLeast(context.actor.websiteRole, 'sailing-master')),
  deleteFlightPlan: (context) =>
    isAuthenticated(context) &&
    (isOwner(context) || isRoleAtLeast(context.actor.websiteRole, 'quartermaster')),
  downloadMedia: (context) =>
    canAdminReadAllContent(context) || Boolean(context.attributes?.downloadMedia === true),
  manageMissionMedia: (context) =>
    isAuthenticated(context) && isRoleAtLeast(context.actor.websiteRole, 'captain'),
  manageAvatar: (context) =>
    isAuthenticated(context) &&
    (isOwner(context) || isRoleAtLeast(context.actor.websiteRole, 'captain')),
  manageHonorBadgeMedia: (context) =>
    isAuthenticated(context) &&
    (canAdminEditAllContent(context) || isRoleAtLeast(context.actor.websiteRole, 'captain')),
  adminReadAllContent: (context) => canAdminReadAllContent(context),
  adminEditAllContent: (context) => canAdminEditAllContent(context),
});

export const evaluateCapabilityBinding = (
  capability: AuthorizationCapability,
  contextInput: AuthorizationContext | Parameters<typeof buildAuthorizationContext>[0],
  resource?: AuthorizationResource,
): boolean => {
  const context =
    contextInput && 'actor' in (contextInput as Record<string, unknown>)
      ? (contextInput as AuthorizationContext)
      : buildAuthorizationContext(contextInput as Parameters<typeof buildAuthorizationContext>[0]);
  return bindings[capability](context, resource);
};
