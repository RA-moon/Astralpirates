import {
  deriveFlightPlanLifecycleBucket,
  normaliseFlightPlanLifecycleStatus,
  isFlightPlanLifecycleTerminalStatus,
  type FlightPlanLifecycleBucket,
  type FlightPlanLifecycleStatus,
} from '@astralpirates/shared/flightPlanLifecycle';
import { can } from '@astralpirates/shared/authorization';

export const FLIGHT_PLAN_STATUS_LABELS: Readonly<Record<FlightPlanLifecycleStatus, string>> = {
  planned: 'Planned',
  pending: 'Pending',
  ongoing: 'Ongoing',
  'on-hold': 'On hold',
  postponed: 'Postponed',
  success: 'Success',
  failure: 'Failure',
  aborted: 'Aborted',
  cancelled: 'Cancelled',
};

export const FLIGHT_PLAN_BUCKET_LABELS: Readonly<Record<FlightPlanLifecycleBucket, string>> = {
  active: 'Active',
  finished: 'Finished',
  archived: 'Archived',
};

export const resolveFlightPlanLifecycleStatus = (value: unknown): FlightPlanLifecycleStatus => {
  return normaliseFlightPlanLifecycleStatus(value)?.status ?? 'planned';
};

export const resolveFlightPlanLifecycleBucket = (value: unknown): FlightPlanLifecycleBucket => {
  return deriveFlightPlanLifecycleBucket(resolveFlightPlanLifecycleStatus(value));
};

export const getFlightPlanStatusLabel = (value: unknown): string => {
  const status = resolveFlightPlanLifecycleStatus(value);
  return FLIGHT_PLAN_STATUS_LABELS[status];
};

export const getFlightPlanBucketLabel = (value: unknown): string => {
  const bucket = resolveFlightPlanLifecycleBucket(value);
  return FLIGHT_PLAN_BUCKET_LABELS[bucket];
};

export const canEditFlightPlanMission = ({
  ownerId = null,
  viewerUserId = null,
  viewerRole = null,
  adminViewEnabled = false,
  adminEditEnabled = false,
  isOwner,
  isCrewOrganiser,
  membershipResolved,
  viewerIsContributor,
  status,
}: {
  ownerId?: string | number | null;
  viewerUserId?: string | number | null;
  viewerRole?: string | null;
  adminViewEnabled?: boolean;
  adminEditEnabled?: boolean;
  isOwner: boolean;
  isCrewOrganiser: boolean;
  membershipResolved: boolean;
  viewerIsContributor: boolean;
  status: unknown;
}): boolean => {
  const terminal = isFlightPlanLifecycleTerminalStatus(resolveFlightPlanLifecycleStatus(status));
  if (terminal && !isOwner) return false;
  if (viewerIsContributor && !isOwner) return false;

  const baselineEdit = isOwner || (membershipResolved && isCrewOrganiser);

  return can('editFlightPlan', {
    actor: {
      userId: viewerUserId,
      isAuthenticated: viewerUserId != null,
      websiteRole: viewerRole,
    },
    owner: {
      userId: ownerId,
    },
    membership: {
      role: isOwner ? 'owner' : isCrewOrganiser ? 'crew' : null,
      status: membershipResolved || isOwner ? 'accepted' : null,
    },
    toggles: {
      adminViewEnabled,
      adminEditEnabled,
    },
    attributes: {
      editFlightPlan: baselineEdit,
    },
  });
};

export const canManageFlightPlanLifecycleForViewer = ({
  ownerId,
  viewerUserId,
  viewerRole,
}: {
  ownerId: string | number | null;
  viewerUserId: string | number | null;
  viewerRole: string | null;
}): boolean =>
  can('manageFlightPlanLifecycle', {
    actor: {
      userId: viewerUserId,
      isAuthenticated: viewerUserId != null,
      websiteRole: viewerRole,
    },
    owner: {
      userId: ownerId,
    },
  });

export const canDeleteFlightPlanForViewer = ({
  ownerId,
  viewerUserId,
  viewerRole,
}: {
  ownerId: string | number | null;
  viewerUserId: string | number | null;
  viewerRole: string | null;
}): boolean =>
  can('deleteFlightPlan', {
    actor: {
      userId: viewerUserId,
      isAuthenticated: viewerUserId != null,
      websiteRole: viewerRole,
    },
    owner: {
      userId: ownerId,
    },
  });
