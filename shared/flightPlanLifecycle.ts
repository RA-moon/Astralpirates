const toTrimmedLower = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
};

export const FLIGHT_PLAN_LIFECYCLE_STATUSES = [
  'planned',
  'pending',
  'ongoing',
  'on-hold',
  'postponed',
  'success',
  'failure',
  'aborted',
  'cancelled',
] as const;

export type FlightPlanLifecycleStatus = (typeof FLIGHT_PLAN_LIFECYCLE_STATUSES)[number];

const statusSet: ReadonlySet<FlightPlanLifecycleStatus> = new Set(FLIGHT_PLAN_LIFECYCLE_STATUSES);

export const FLIGHT_PLAN_LIFECYCLE_TERMINAL_STATUSES = [
  'success',
  'failure',
  'aborted',
  'cancelled',
] as const;

export type FlightPlanLifecycleTerminalStatus =
  (typeof FLIGHT_PLAN_LIFECYCLE_TERMINAL_STATUSES)[number];

const terminalStatusSet: ReadonlySet<FlightPlanLifecycleTerminalStatus> = new Set(
  FLIGHT_PLAN_LIFECYCLE_TERMINAL_STATUSES,
);

export const FLIGHT_PLAN_LIFECYCLE_REOPENABLE_STATUSES = [
  'failure',
  'aborted',
  'cancelled',
] as const;

export type FlightPlanLifecycleReopenableStatus =
  (typeof FLIGHT_PLAN_LIFECYCLE_REOPENABLE_STATUSES)[number];

const reopenableStatusSet: ReadonlySet<FlightPlanLifecycleReopenableStatus> = new Set(
  FLIGHT_PLAN_LIFECYCLE_REOPENABLE_STATUSES,
);

export const FLIGHT_PLAN_LIFECYCLE_ACTIVE_STATUSES = ['ongoing'] as const;

export type FlightPlanLifecycleActiveStatus =
  (typeof FLIGHT_PLAN_LIFECYCLE_ACTIVE_STATUSES)[number];

const activeStatusSet: ReadonlySet<FlightPlanLifecycleActiveStatus> = new Set(
  FLIGHT_PLAN_LIFECYCLE_ACTIVE_STATUSES,
);

export const FLIGHT_PLAN_LIFECYCLE_BUCKETS = ['active', 'finished', 'archived'] as const;

export type FlightPlanLifecycleBucket = (typeof FLIGHT_PLAN_LIFECYCLE_BUCKETS)[number];

const bucketSet: ReadonlySet<FlightPlanLifecycleBucket> = new Set(FLIGHT_PLAN_LIFECYCLE_BUCKETS);

export const FLIGHT_PLAN_STATUS_REASON_REQUIRED_TARGETS = [
  'on-hold',
  'postponed',
  'failure',
  'aborted',
  'cancelled',
] as const;

const reasonRequiredTargetSet: ReadonlySet<FlightPlanLifecycleStatus> = new Set(
  FLIGHT_PLAN_STATUS_REASON_REQUIRED_TARGETS,
);

export const FLIGHT_PLAN_STATUS_REASON_MIN_LENGTH = 12;
export const FLIGHT_PLAN_STATUS_REASON_MAX_LENGTH = 500;

export const FLIGHT_PLAN_STATUS_EVENT_ACTION_TYPES = [
  'transition',
  'reopen',
  'normalize',
  'backfill',
] as const;

export type FlightPlanStatusEventActionType =
  (typeof FLIGHT_PLAN_STATUS_EVENT_ACTION_TYPES)[number];

export type FlightPlanStatusEventTransitionActionType =
  Extract<FlightPlanStatusEventActionType, 'transition' | 'reopen'>;

const statusAliasMap = new Map<string, FlightPlanLifecycleStatus>([
  ['abortet', 'aborted'],
  ['abort', 'aborted'],
  ['canceled', 'cancelled'],
  ['on_hold', 'on-hold'],
  ['onhold', 'on-hold'],
]);

export type NormalizedFlightPlanLifecycleStatus = {
  status: FlightPlanLifecycleStatus;
  normalizedFromAlias: boolean;
  original: string;
};

export const normaliseFlightPlanLifecycleStatus = (
  value: unknown,
): NormalizedFlightPlanLifecycleStatus | null => {
  const original = toTrimmedLower(value);
  if (!original) return null;

  if (statusSet.has(original as FlightPlanLifecycleStatus)) {
    return {
      status: original as FlightPlanLifecycleStatus,
      normalizedFromAlias: false,
      original,
    };
  }

  const aliasTarget = statusAliasMap.get(original);
  if (!aliasTarget) return null;

  return {
    status: aliasTarget,
    normalizedFromAlias: true,
    original,
  };
};

export const normaliseFlightPlanLifecycleBucket = (
  value: unknown,
): FlightPlanLifecycleBucket | null => {
  const normalized = toTrimmedLower(value);
  if (!normalized || !bucketSet.has(normalized as FlightPlanLifecycleBucket)) {
    return null;
  }
  return normalized as FlightPlanLifecycleBucket;
};

const transitionMatrix: Record<FlightPlanLifecycleStatus, readonly FlightPlanLifecycleStatus[]> = {
  planned: ['pending', 'ongoing', 'on-hold', 'postponed', 'cancelled'],
  pending: ['planned', 'ongoing', 'on-hold', 'postponed', 'cancelled'],
  ongoing: ['on-hold', 'success', 'failure', 'aborted'],
  'on-hold': ['pending', 'ongoing', 'postponed', 'cancelled', 'aborted'],
  postponed: ['pending', 'ongoing', 'on-hold', 'cancelled'],
  success: [],
  failure: [],
  aborted: [],
  cancelled: [],
};

export const getAllowedFlightPlanLifecycleTransitions = (
  fromStatus: FlightPlanLifecycleStatus,
): readonly FlightPlanLifecycleStatus[] => transitionMatrix[fromStatus];

export const canTransitionFlightPlanLifecycleStatus = ({
  fromStatus,
  toStatus,
}: {
  fromStatus: FlightPlanLifecycleStatus;
  toStatus: FlightPlanLifecycleStatus;
}): boolean => transitionMatrix[fromStatus].includes(toStatus);

export const isFlightPlanLifecycleTerminalStatus = (
  value: unknown,
): value is FlightPlanLifecycleTerminalStatus => {
  const normalized = toTrimmedLower(value);
  if (!normalized) return false;
  return terminalStatusSet.has(normalized as FlightPlanLifecycleTerminalStatus);
};

export const isFlightPlanLifecycleReopenableStatus = (
  value: unknown,
): value is FlightPlanLifecycleReopenableStatus => {
  const normalized = toTrimmedLower(value);
  if (!normalized) return false;
  return reopenableStatusSet.has(normalized as FlightPlanLifecycleReopenableStatus);
};

export const deriveFlightPlanLifecycleBucket = (
  status: FlightPlanLifecycleStatus,
): FlightPlanLifecycleBucket => {
  if (activeStatusSet.has(status as FlightPlanLifecycleActiveStatus)) {
    return 'active';
  }
  if (terminalStatusSet.has(status as FlightPlanLifecycleTerminalStatus)) {
    return 'finished';
  }
  return 'archived';
};

export const shouldRequireReasonForFlightPlanTransition = ({
  action,
  targetStatus,
}: {
  action: FlightPlanStatusEventTransitionActionType;
  targetStatus: FlightPlanLifecycleStatus;
}): boolean => {
  if (action === 'reopen') {
    return true;
  }
  return reasonRequiredTargetSet.has(targetStatus);
};

export const normaliseFlightPlanStatusReason = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const validateFlightPlanStatusReason = ({
  reason,
  required,
}: {
  reason: unknown;
  required: boolean;
}):
  | { ok: true; reason: string | null }
  | { ok: false; error: string } => {
  const normalized = normaliseFlightPlanStatusReason(reason);

  if (!required && normalized == null) {
    return { ok: true, reason: null };
  }

  if (required && normalized == null) {
    return {
      ok: false,
      error: `statusReason is required (minimum ${FLIGHT_PLAN_STATUS_REASON_MIN_LENGTH} characters).`,
    };
  }

  const finalReason = normalized as string;
  if (finalReason.length < FLIGHT_PLAN_STATUS_REASON_MIN_LENGTH) {
    return {
      ok: false,
      error: `statusReason must be at least ${FLIGHT_PLAN_STATUS_REASON_MIN_LENGTH} characters.`,
    };
  }
  if (finalReason.length > FLIGHT_PLAN_STATUS_REASON_MAX_LENGTH) {
    return {
      ok: false,
      error: `statusReason must be at most ${FLIGHT_PLAN_STATUS_REASON_MAX_LENGTH} characters.`,
    };
  }

  return { ok: true, reason: finalReason };
};

export const FLIGHT_PLAN_REOPEN_TARGET_STATUS: FlightPlanLifecycleStatus = 'pending';
