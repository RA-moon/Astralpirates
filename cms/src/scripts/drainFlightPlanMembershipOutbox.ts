import payload from 'payload';

import payloadConfig from '@/payload.config.ts';
import {
  enqueueFlightPlanMembershipJob,
  type FlightPlanMembershipJob,
} from '@/src/queues/flightPlanMembershipQueue.ts';
import { isNeo4jSyncDisabled } from '@/src/utils/neo4j.ts';

const BATCH_SIZE = 100;

type IdLike = string | number | null | undefined;

const normaliseId = (value: IdLike): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
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

const toJobPayload = (doc: Record<string, unknown>): FlightPlanMembershipJob | null => {
  const eventId = normaliseId(doc.id);
  const flightPlanId = normaliseId(doc.flightPlan);
  const userId = normaliseId(doc.user);
  if (flightPlanId == null || userId == null) return null;

  const membershipId = normaliseId((doc as { membership?: IdLike }).membership ?? null);
  const payloadData = (doc.payload ?? {}) as Record<string, unknown>;

  return {
    eventId: eventId ?? undefined,
    membershipId: membershipId ?? undefined,
    flightPlanId,
    userId,
    role: sanitizeRole(payloadData.role ?? (doc as any).role),
    status: sanitizeStatus(payloadData.status ?? (doc as any).status),
    invitedAt:
      typeof payloadData.invitedAt === 'string' ? payloadData.invitedAt : (doc as any).invitedAt,
    respondedAt:
      typeof payloadData.respondedAt === 'string'
        ? payloadData.respondedAt
        : (doc as any).respondedAt,
    eventType:
      typeof (doc as any).eventType === 'string'
        ? (doc as any).eventType
        : typeof payloadData.eventType === 'string'
          ? payloadData.eventType
          : null,
  };
};

const run = async () => {
  if (isNeo4jSyncDisabled()) {
    console.log('[flight-plan-memberships] Neo4j sync disabled; skipping queue backfill.');
    return;
  }

  const instance = await payload.init({ config: payloadConfig });
  const logger = instance.logger?.child({ script: 'drain-flight-plan-memberships' }) ?? console;

  try {
    let processed = 0;
    while (true) {
      const batch = await instance.find({
        collection: 'flight-plan-membership-events',
        where: {
          processedAt: {
            equals: null,
          },
        },
        limit: BATCH_SIZE,
        depth: 0,
        sort: 'queuedAt',
        overrideAccess: true,
      });

      if (batch.docs.length === 0) {
        logger.info?.({ processed }, '[flight-plan-memberships] Outbox emptied into queue');
        break;
      }

      for (const doc of batch.docs as Record<string, unknown>[]) {
        const job = toJobPayload(doc);

        if (!job) {
          logger.warn?.(
            { doc },
            '[flight-plan-memberships] Skipping outbox record due to missing identifiers',
          );
          continue;
        }

        try {
          await enqueueFlightPlanMembershipJob(job);
          processed += 1;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('JobIdAlreadyExists')) {
            logger.debug?.(
              { job },
              '[flight-plan-memberships] Job already enqueued; skipping duplicate',
            );
            continue;
          }
          logger.error?.(
            { err: error, job },
            '[flight-plan-memberships] Failed to enqueue job from outbox',
          );
        }
      }
    }
  } finally {
    if (typeof instance.close === 'function') {
      await instance.close();
    }
  }
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[flight-plan-memberships] Failed to backfill queue');
    console.error(error);
    process.exit(1);
  });
