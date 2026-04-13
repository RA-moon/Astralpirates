import { Queue } from 'bullmq';

import { getRedisConnectionOptions } from './redis.ts';

export type FlightPlanMembershipJob = {
  eventId?: number | null;
  membershipId?: number | null;
  flightPlanId: number | string;
  userId: number | string;
  role: string;
  status: string;
  invitedAt?: string | null;
  respondedAt?: string | null;
  eventType?: string | null;
};

type SanitizedJob = {
  eventId?: number;
  membershipId?: number;
  flightPlanId: number;
  userId: number;
  role: string;
  status: string;
  invitedAt: string | null;
  respondedAt: string | null;
  eventType: string | null;
};

const FLIGHT_PLAN_MEMBERSHIP_QUEUE = 'flight-plan-membership';
const JOB_NAME = 'sync-membership';

let queue: Queue<SanitizedJob> | null = null;

const normaliseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
};

const normaliseString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normaliseRole = (value: unknown): string => {
  if (typeof value === 'string' && value.length > 0) {
    const normalised = value.toLowerCase();
    if (normalised === 'owner' || normalised === 'crew' || normalised === 'guest') {
      return normalised;
    }
    if (normalised === 'participant') {
      return 'guest';
    }
    return normalised;
  }
  return 'guest';
};

const normaliseStatus = (value: unknown): string => {
  if (typeof value === 'string' && value.length > 0) {
    const normalised = value.toLowerCase();
    if (
      normalised === 'accepted' ||
      normalised === 'declined' ||
      normalised === 'pending' ||
      normalised === 'revoked'
    ) {
      return normalised;
    }
    return normalised;
  }
  return 'pending';
};

const sanitiseJob = (job: FlightPlanMembershipJob): SanitizedJob => {
  const flightPlanId = normaliseNumber(job.flightPlanId);
  const userId = normaliseNumber(job.userId);
  if (flightPlanId == null || userId == null) {
    throw new Error('Invalid flight plan membership job: missing identifiers');
  }

  const membershipId = job.membershipId != null ? normaliseNumber(job.membershipId) : undefined;
  const eventId = job.eventId != null ? normaliseNumber(job.eventId) : undefined;
  const role = normaliseRole(job.role);
  const status = normaliseStatus(job.status);

  return {
    eventId,
    membershipId,
    flightPlanId,
    userId,
    role,
    status,
    invitedAt: normaliseString(job.invitedAt ?? null),
    respondedAt: normaliseString(job.respondedAt ?? null),
    eventType: job.eventType ? job.eventType.toString() : null,
  };
};

const getQueue = (): Queue<SanitizedJob> => {
  if (!queue) {
    queue = new Queue<SanitizedJob>(FLIGHT_PLAN_MEMBERSHIP_QUEUE, {
      connection: getRedisConnectionOptions(),
    });
  }
  return queue;
};

export const enqueueFlightPlanMembershipJob = async (
  job: FlightPlanMembershipJob,
): Promise<void> => {
  const queueInstance = getQueue();
  const data = sanitiseJob(job);

  try {
    await queueInstance.add(JOB_NAME, data, {
      jobId: data.eventId ? `flight-plan-membership-${data.eventId}` : undefined,
      removeOnComplete: true,
      removeOnFail: 500,
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5_000,
      },
    });
  } catch (error) {
    console.error('[queue] Failed to enqueue flight plan membership job', { data, error });
    throw error;
  }
};

export const drainFlightPlanMembershipQueue = async (): Promise<void> => {
  const queueInstance = getQueue();

  await queueInstance.drain(true);
  await Promise.all([
    queueInstance.clean(0, 1000, 'completed'),
    queueInstance.clean(0, 1000, 'failed'),
  ]);
};

export const closeFlightPlanMembershipQueue = async (): Promise<void> => {
  const tasks: Promise<void>[] = [];

  if (queue) {
    tasks.push(
      queue
        .close()
        .catch((error) => console.warn('[queue] Failed to close membership queue', error))
        .finally(() => {
          queue = null;
        }),
    );
  }

  await Promise.all(tasks);
};

export const __testExports = {
  sanitiseJob,
  normaliseRole,
  normaliseStatus,
};

export { FLIGHT_PLAN_MEMBERSHIP_QUEUE };
