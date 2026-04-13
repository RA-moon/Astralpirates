import type { Payload, PayloadRequest } from 'payload';

import type { User } from '@/payload-types';
import type { EffectiveAdminMode } from '@astralpirates/shared/adminMode';
import { can } from '@astralpirates/shared/authorization';
import {
  FLIGHT_PLAN_LIFECYCLE_ACTIVE_STATUSES,
  FLIGHT_PLAN_LIFECYCLE_BUCKETS,
  FLIGHT_PLAN_LIFECYCLE_REOPENABLE_STATUSES,
  FLIGHT_PLAN_LIFECYCLE_STATUSES,
  FLIGHT_PLAN_LIFECYCLE_TERMINAL_STATUSES,
  FLIGHT_PLAN_REOPEN_TARGET_STATUS,
  canTransitionFlightPlanLifecycleStatus,
  normaliseFlightPlanLifecycleBucket,
  normaliseFlightPlanLifecycleStatus,
  validateFlightPlanStatusReason,
  shouldRequireReasonForFlightPlanTransition,
  type FlightPlanLifecycleBucket,
  type FlightPlanLifecycleStatus,
  type FlightPlanStatusEventActionType,
  type FlightPlanStatusEventTransitionActionType,
} from '@astralpirates/shared/flightPlanLifecycle';
import { buildRequestForUser } from './auth';
import { resolveOwners, sanitizeFlightPlan } from './content';
import { normaliseId } from './flightPlanMembers';

const TERMINAL_STATUS_SET = new Set<FlightPlanLifecycleStatus>(
  FLIGHT_PLAN_LIFECYCLE_TERMINAL_STATUSES,
);
const ACTIVE_STATUS_SET = new Set<FlightPlanLifecycleStatus>(
  FLIGHT_PLAN_LIFECYCLE_ACTIVE_STATUSES,
);
const REOPENABLE_STATUS_SET = new Set<FlightPlanLifecycleStatus>(
  FLIGHT_PLAN_LIFECYCLE_REOPENABLE_STATUSES,
);

const normalizeTimestamp = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

export const resolveFlightPlanLifecycleStatus = (value: unknown): FlightPlanLifecycleStatus => {
  return normaliseFlightPlanLifecycleStatus(value)?.status ?? 'planned';
};

export const isTerminalFlightPlanStatus = (status: unknown): boolean => {
  return TERMINAL_STATUS_SET.has(resolveFlightPlanLifecycleStatus(status));
};

export const canManageFlightPlanLifecycle = ({
  ownerId,
  user,
  adminMode,
}: {
  ownerId: number | null;
  user: { id?: unknown; role?: unknown } | null | undefined;
  adminMode?: EffectiveAdminMode | null;
}): boolean => {
  const userId = normaliseId(user?.id);
  return can('manageFlightPlanLifecycle', {
    actor: {
      userId,
      isAuthenticated: userId != null,
      websiteRole: user?.role ?? null,
    },
    owner: {
      userId: ownerId,
    },
    toggles: {
      adminViewEnabled: adminMode?.adminViewEnabled ?? false,
      adminEditEnabled: adminMode?.adminEditEnabled ?? false,
    },
  });
};

export const canHardDeleteFlightPlan = ({
  ownerId,
  user,
  adminMode,
}: {
  ownerId: number | null;
  user: { id?: unknown; role?: unknown } | null | undefined;
  adminMode?: EffectiveAdminMode | null;
}): boolean => {
  const userId = normaliseId(user?.id);
  return can('deleteFlightPlan', {
    actor: {
      userId,
      isAuthenticated: userId != null,
      websiteRole: user?.role ?? null,
    },
    owner: {
      userId: ownerId,
    },
    toggles: {
      adminViewEnabled: adminMode?.adminViewEnabled ?? false,
      adminEditEnabled: adminMode?.adminEditEnabled ?? false,
    },
  });
};

export const resolveStatusesForBucket = (
  bucket: FlightPlanLifecycleBucket,
): readonly FlightPlanLifecycleStatus[] => {
  if (bucket === 'active') return FLIGHT_PLAN_LIFECYCLE_ACTIVE_STATUSES;
  if (bucket === 'finished') return FLIGHT_PLAN_LIFECYCLE_TERMINAL_STATUSES;
  return FLIGHT_PLAN_LIFECYCLE_STATUSES.filter(
    (status) => !ACTIVE_STATUS_SET.has(status) && !TERMINAL_STATUS_SET.has(status),
  );
};

export const parseFlightPlanBucketFilter = (
  value: unknown,
):
  | { ok: true; bucket: FlightPlanLifecycleBucket | null }
  | { ok: false; error: string } => {
  if (value == null || value === '') {
    return { ok: true, bucket: null };
  }

  const bucket = normaliseFlightPlanLifecycleBucket(value);
  if (!bucket) {
    return {
      ok: false,
      error: `bucket must be one of: ${FLIGHT_PLAN_LIFECYCLE_BUCKETS.join(', ')}.`,
    };
  }

  return { ok: true, bucket };
};

export const parseFlightPlanStatusFilters = (
  values: string[],
):
  | { ok: true; statuses: FlightPlanLifecycleStatus[] }
  | { ok: false; error: string } => {
  if (!values.length) {
    return { ok: true, statuses: [] };
  }

  const statuses = new Set<FlightPlanLifecycleStatus>();

  for (const value of values) {
    const normalized = normaliseFlightPlanLifecycleStatus(value);
    if (!normalized) {
      return {
        ok: false,
        error: `status must be one of: ${FLIGHT_PLAN_LIFECYCLE_STATUSES.join(', ')} (aliases: canceled, abort, abortet, on_hold, onhold).`,
      };
    }
    statuses.add(normalized.status);
  }

  return {
    ok: true,
    statuses: Array.from(statuses),
  };
};

export const validateTransitionRequest = ({
  currentStatus,
  targetStatus,
  reason,
}: {
  currentStatus: FlightPlanLifecycleStatus;
  targetStatus: unknown;
  reason: unknown;
}):
  | {
      ok: true;
      toStatus: FlightPlanLifecycleStatus;
      reason: string | null;
      actionType: Extract<FlightPlanStatusEventActionType, 'transition' | 'normalize'>;
    }
  | { ok: false; error: string } => {
  const normalizedTarget = normaliseFlightPlanLifecycleStatus(targetStatus);
  if (!normalizedTarget) {
    return {
      ok: false,
      error: `status must be one of: ${FLIGHT_PLAN_LIFECYCLE_STATUSES.join(', ')}.`,
    };
  }

  if (
    !canTransitionFlightPlanLifecycleStatus({
      fromStatus: currentStatus,
      toStatus: normalizedTarget.status,
    })
  ) {
    return {
      ok: false,
      error: `Transition from ${currentStatus} to ${normalizedTarget.status} is not allowed.`,
    };
  }

  const reasonValidation = validateFlightPlanStatusReason({
    reason,
    required: shouldRequireReasonForFlightPlanTransition({
      action: 'transition',
      targetStatus: normalizedTarget.status,
    }),
  });
  if (!reasonValidation.ok) {
    return {
      ok: false,
      error: reasonValidation.error,
    };
  }

  return {
    ok: true,
    toStatus: normalizedTarget.status,
    reason: reasonValidation.reason,
    actionType: normalizedTarget.normalizedFromAlias ? 'normalize' : 'transition',
  };
};

export const validateReopenRequest = ({
  currentStatus,
  reason,
}: {
  currentStatus: FlightPlanLifecycleStatus;
  reason: unknown;
}):
  | {
      ok: true;
      toStatus: FlightPlanLifecycleStatus;
      reason: string;
      actionType: FlightPlanStatusEventTransitionActionType;
    }
  | { ok: false; error: string } => {
  if (!REOPENABLE_STATUS_SET.has(currentStatus)) {
    return {
      ok: false,
      error: `Only ${FLIGHT_PLAN_LIFECYCLE_REOPENABLE_STATUSES.join(', ')} missions can be reopened.`,
    };
  }

  const reasonValidation = validateFlightPlanStatusReason({
    reason,
    required: true,
  });
  if (!reasonValidation.ok || !reasonValidation.reason) {
    return {
      ok: false,
      error: reasonValidation.ok ? 'statusReason is required.' : reasonValidation.error,
    };
  }

  return {
    ok: true,
    toStatus: FLIGHT_PLAN_REOPEN_TARGET_STATUS,
    reason: reasonValidation.reason,
    actionType: 'reopen',
  };
};

export const buildStatusMutationData = ({
  current,
  toStatus,
  changedBy,
  reason,
  now = new Date(),
}: {
  current: {
    startedAt?: unknown;
    finishedAt?: unknown;
  };
  toStatus: FlightPlanLifecycleStatus;
  changedBy: unknown;
  reason: string | null;
  now?: Date;
}) => {
  const timestamp = now.toISOString();
  const startedAt = normalizeTimestamp(current.startedAt);
  const finishedAt = normalizeTimestamp(current.finishedAt);
  const changedById = normaliseId(changedBy);

  return {
    status: toStatus,
    statusChangedAt: timestamp,
    statusChangedBy: changedById,
    statusReason: reason,
    startedAt: startedAt ?? (toStatus === 'ongoing' ? timestamp : null),
    finishedAt:
      finishedAt ?? (TERMINAL_STATUS_SET.has(toStatus) ? timestamp : null),
  };
};

export const sanitizeFlightPlanSlug = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const buildPreservedFlightPlanAccessData = (
  plan: Record<string, unknown>,
): Record<string, unknown> => ({
  visibility: plan.visibility,
  accessPolicy: plan.accessPolicy ?? null,
  mediaVisibility: plan.mediaVisibility,
  crewCanPromotePassengers: Boolean(plan.crewCanPromotePassengers),
  passengersCanCreateTasks: Boolean(plan.passengersCanCreateTasks),
  passengersCanCommentOnTasks: Boolean(plan.passengersCanCommentOnTasks),
  isPublic: Boolean(plan.isPublic),
  publicContributions: Boolean(plan.publicContributions),
});

export const findFlightPlanBySlug = async ({
  payload,
  slug,
  depth = 0,
}: {
  payload: Payload;
  slug: string;
  depth?: number;
}): Promise<Record<string, unknown> | null> => {
  const result = await payload.find({
    collection: 'flight-plans',
    where: {
      slug: {
        equals: slug,
      },
    },
    limit: 1,
    depth,
    overrideAccess: true,
  });

  return (result.docs[0] as unknown as Record<string, unknown> | undefined) ?? null;
};

export const applyFlightPlanLifecycleTransition = async ({
  payload,
  user,
  plan,
  flightPlanId,
  fromStatus,
  toStatus,
  reason,
  actionType,
}: {
  payload: Payload;
  user: User;
  plan: Record<string, unknown>;
  flightPlanId: number;
  fromStatus: FlightPlanLifecycleStatus;
  toStatus: FlightPlanLifecycleStatus;
  reason: string | null;
  actionType: FlightPlanStatusEventActionType;
}) => {
  const statusMutation = buildStatusMutationData({
    current: {
      startedAt: plan.startedAt,
      finishedAt: plan.finishedAt,
    },
    toStatus,
    changedBy: user.id,
    reason,
  });

  const reqForUser = await buildRequestForUser(payload, user as any);
  const updated = await payload.update({
    collection: 'flight-plans',
    id: flightPlanId,
    data: {
      ...statusMutation,
      ...buildPreservedFlightPlanAccessData(plan),
    } as any,
    req: reqForUser,
    depth: 1,
  });

  const changedById = normaliseId(user.id);
  await createFlightPlanStatusEvent({
    payload,
    req: reqForUser,
    flightPlanId,
    fromStatus,
    toStatus,
    reason,
    changedBy: changedById,
    changedAt: statusMutation.statusChangedAt,
    actionType,
  });

  const ownerMap = await resolveOwners(payload, [updated as any]);
  return {
    plan: sanitizeFlightPlan(updated as any, ownerMap),
    changedById,
  };
};

export const createFlightPlanStatusEvent = async ({
  payload,
  req,
  flightPlanId,
  fromStatus,
  toStatus,
  reason,
  changedBy,
  changedAt,
  actionType,
}: {
  payload: Payload;
  req?: PayloadRequest;
  flightPlanId: number;
  fromStatus: FlightPlanLifecycleStatus | null;
  toStatus: FlightPlanLifecycleStatus;
  reason: string | null;
  changedBy: number | null;
  changedAt: string;
  actionType: FlightPlanStatusEventActionType;
}) => {
  await payload.create({
    collection: 'flight-plan-status-events' as any,
    data: {
      flightPlan: flightPlanId,
      fromStatus,
      toStatus,
      reason,
      changedBy,
      changedAt,
      actionType,
    } as any,
    overrideAccess: true,
    req,
  });
};
