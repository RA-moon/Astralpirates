import type { Payload } from 'payload';

import {
  enqueueFlightPlanMembershipJob,
  type FlightPlanMembershipJob,
} from '@/src/queues/flightPlanMembershipQueue.ts';
import { isNeo4jSyncEnabled } from '@/src/utils/neo4j.ts';

type IdLike = string | number | null | undefined;

const QUEUE_ENQUEUE_TIMEOUT_MS = Number.parseInt(
  process.env.FLIGHT_PLAN_MEMBERSHIP_QUEUE_TIMEOUT_MS ?? '',
  10,
) || 5_000;

const normaliseId = (value: IdLike): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

export type MembershipEventInput = {
  membershipId?: IdLike;
  flightPlanId: IdLike;
  userId: IdLike;
  role: string;
  status: string;
  invitedById?: IdLike;
  invitedAt?: string | null;
  respondedAt?: string | null;
  eventType?: string;
  payloadOverride?: Record<string, unknown>;
};

const sanitizeRole = (value: unknown): string => {
  if (typeof value === 'string' && value.length > 0) {
    const normalised = value.toLowerCase();
    if (normalised === 'owner' || normalised === 'crew' || normalised === 'guest') return normalised;
    if (normalised === 'participant') return 'guest';
    return normalised;
  }
  return 'guest';
};

const sanitizeStatus = (value: unknown): string => {
  if (typeof value === 'string' && value.length > 0) {
    const normalised = value.toLowerCase();
    if (normalised === 'accepted' || normalised === 'declined' || normalised === 'revoked' || normalised === 'pending') {
      return normalised;
    }
    return normalised;
  }
  return 'pending';
};

const withTimeout = async <T>(task: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const enqueueFlightPlanMembershipEvent = async (
  payload: Payload,
  input: MembershipEventInput,
) => {
  const flightPlanId = normaliseId(input.flightPlanId);
  const userId = normaliseId(input.userId);
  if (flightPlanId == null || userId == null) {
    payload.logger?.warn?.(
      { flightPlanId: input.flightPlanId, userId: input.userId },
      '[flight-plan-membership] skipped enqueue due to missing identifiers',
    );
    return;
  }

  const membershipId = normaliseId(input.membershipId);
  const invitedById = normaliseId(input.invitedById);
  const queuedAt = new Date().toISOString();

  const payloadData =
    input.payloadOverride ??
    {
      flightPlanId,
      userId,
      role: input.role,
      status: input.status,
      invitedById,
      invitedAt: input.invitedAt ?? null,
      respondedAt: input.respondedAt ?? null,
    };

  try {
    const eventDoc = await payload.create({
      collection: 'flight-plan-membership-events',
      data: {
        membership: membershipId ?? undefined,
        flightPlan: flightPlanId,
        user: userId,
        eventType: input.eventType ?? 'sync',
        payload: payloadData,
        attempts: 0,
        queuedAt,
        lockedAt: null,
        processedAt: null,
      },
      draft: false,
      overrideAccess: true,
    });

    const eventId = normaliseId(eventDoc.id);
    const job: FlightPlanMembershipJob = {
      eventId: eventId ?? undefined,
      membershipId: membershipId ?? undefined,
      flightPlanId,
      userId,
      role: sanitizeRole(payloadData.role ?? input.role),
      status: sanitizeStatus(payloadData.status ?? input.status),
      invitedAt:
        typeof payloadData.invitedAt === 'string' ? payloadData.invitedAt : input.invitedAt ?? null,
      respondedAt:
        typeof payloadData.respondedAt === 'string'
          ? payloadData.respondedAt
          : input.respondedAt ?? null,
      eventType: input.eventType ?? 'sync',
    };

    if (isNeo4jSyncEnabled()) {
      try {
        await withTimeout(
          enqueueFlightPlanMembershipJob(job),
          QUEUE_ENQUEUE_TIMEOUT_MS,
          '[flight-plan-membership] enqueue redis job',
        );
      } catch (queueError) {
        payload.logger?.error?.(
          { err: queueError, eventId, membershipId, flightPlanId, userId },
          '[flight-plan-membership] failed to enqueue redis job',
        );
      }
    } else {
      payload.logger?.debug?.(
        { eventId, membershipId, flightPlanId, userId },
        '[flight-plan-membership] neo4j sync disabled; job left in outbox',
      );
    }
  } catch (error) {
    payload.logger?.error?.(
      { err: error, flightPlanId, userId },
      '[flight-plan-membership] failed to enqueue outbox event',
    );
  }
};
