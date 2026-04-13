import { Queue, QueueEvents, Worker } from 'bullmq';
import { Gauge, Pushgateway, Registry } from 'prom-client';
import payload from 'payload';

import payloadConfig from '@/payload.config.ts';
import {
  FLIGHT_PLAN_MEMBERSHIP_QUEUE,
  type FlightPlanMembershipJob,
} from '@/src/queues/flightPlanMembershipQueue.ts';
import { getRedisConnectionOptions } from '@/src/queues/redis.ts';
import {
  closeNeo4jDriver,
  isNeo4jSyncDisabled,
  requireNeo4jSyncEnabled,
} from '@/src/utils/neo4j.ts';
import { rebuildPlanRelationships } from '@/src/utils/neo4jRelationships.ts';
import {
  loadMembershipById,
  type FlightPlanMembershipRecord,
} from '@/app/api/_lib/flightPlanMembers.ts';

const mapRole = (value: string | null | undefined): FlightPlanMembershipRecord['role'] => {
  if (!value) return 'guest';
  const normalised = value.toLowerCase();
  if (normalised === 'owner' || normalised === 'crew' || normalised === 'guest') return normalised;
  if (normalised === 'participant') return 'guest';
  return 'guest';
};

const mapStatus = (
  value: string | null | undefined,
): FlightPlanMembershipRecord['status'] => {
  if (!value) return 'pending';
  const normalised = value.toLowerCase();
  if (
    normalised === 'accepted' ||
    normalised === 'declined' ||
    normalised === 'pending' ||
    normalised === 'revoked'
  ) {
    return normalised;
  }
  return 'pending';
};

const toProjectionPayload = (
  job: FlightPlanMembershipJob,
  membership: FlightPlanMembershipRecord | null,
) => {
  const role = mapRole(membership?.role ?? job.role);
  const status = mapStatus(membership?.status ?? job.status);

  return {
    membershipId: membership?.id ?? (typeof job.membershipId === 'number' ? job.membershipId : null),
    flightPlanId: membership?.flightPlanId ?? Number(job.flightPlanId),
    userId: membership?.userId ?? Number(job.userId),
    role,
    status,
    invitedAt: membership?.invitedAt ?? job.invitedAt ?? null,
    respondedAt: membership?.respondedAt ?? job.respondedAt ?? null,
  };
};

type WorkerContext = {
  shutdown: () => Promise<void>;
};

type MetricsHandles = {
  registry: Registry;
  gauges: {
    waiting: Gauge<string>;
    active: Gauge<string>;
    delayed: Gauge<string>;
    failed: Gauge<string>;
    completed: Gauge<string>;
    failureRate: Gauge<string>;
  };
  pushGateway: Pushgateway<any> | null;
  pushJobName: string;
};

const initMetrics = (): MetricsHandles | null => {
  const registry = new Registry();

  const gauges = {
    waiting: new Gauge({
      name: 'neo4j_membership_queue_waiting',
      help: 'Number of waiting Neo4j membership jobs',
      registers: [registry],
    }),
    active: new Gauge({
      name: 'neo4j_membership_queue_active',
      help: 'Number of active Neo4j membership jobs',
      registers: [registry],
    }),
    delayed: new Gauge({
      name: 'neo4j_membership_queue_delayed',
      help: 'Number of delayed Neo4j membership jobs',
      registers: [registry],
    }),
    failed: new Gauge({
      name: 'neo4j_membership_queue_failed',
      help: 'Number of failed Neo4j membership jobs',
      registers: [registry],
    }),
    completed: new Gauge({
      name: 'neo4j_membership_queue_completed',
      help: 'Number of completed Neo4j membership jobs',
      registers: [registry],
    }),
    failureRate: new Gauge({
      name: 'neo4j_membership_queue_failure_rate',
      help: 'Windowed failure rate for Neo4j membership jobs',
      registers: [registry],
    }),
  };

  const pushUrl = process.env.NEO4J_PROM_PUSHGATEWAY_URL;
  const pushJobName = process.env.NEO4J_PROM_PUSH_JOB_NAME ?? 'neo4j-membership-worker';
  const pushGateway = pushUrl ? new Pushgateway(pushUrl, {}, registry) : null;

  return { registry, gauges, pushGateway, pushJobName };
};

export const startFlightPlanMembershipWorker = async (): Promise<WorkerContext | void> => {
  requireNeo4jSyncEnabled('[neo4j-worker]');
  if (isNeo4jSyncDisabled()) return;

  const payloadInstance = await payload.init({ config: payloadConfig });
  const logger = payloadInstance.logger?.child({ worker: 'flight-plan-memberships' }) ?? console;

  const connection = getRedisConnectionOptions();
  const concurrency =
    Number.parseInt(process.env.FLIGHT_PLAN_WORKER_CONCURRENCY ?? '5', 10) || 5;
  const metricsIntervalMs =
    Number.parseInt(process.env.NEO4J_QUEUE_METRICS_INTERVAL_MS ?? '60000', 10) || 60000;
  const queueDepthWarn =
    Number.parseInt(process.env.NEO4J_QUEUE_DEPTH_WARN ?? '250', 10) || 250;
  const failureRateWarn = Number.parseFloat(process.env.NEO4J_FAILURE_RATE_WARN ?? '0.1') || 0.1;
  const pushIntervalMs =
    Number.parseInt(process.env.NEO4J_PROM_PUSH_INTERVAL_MS ?? `${metricsIntervalMs}`, 10) ||
    metricsIntervalMs;
  const breakerThreshold =
    Number.parseInt(process.env.NEO4J_WORKER_BREAKER_THRESHOLD ?? '5', 10) || 5;
  const breakerCooldownMs =
    Number.parseInt(process.env.NEO4J_WORKER_BREAKER_COOLDOWN_MS ?? '600000', 10) || 600000;

  const queueEvents = new QueueEvents(FLIGHT_PLAN_MEMBERSHIP_QUEUE, { connection });
  queueEvents.on('failed', (event) => {
    logger.warn?.(
      {
        event,
        queue: FLIGHT_PLAN_MEMBERSHIP_QUEUE,
      },
      '[neo4j-worker] Queue event failure',
    );
  });

  await queueEvents.waitUntilReady();
  logger.info?.('[neo4j-worker] Queue events ready');

  const metricsQueue = new Queue<FlightPlanMembershipJob>(FLIGHT_PLAN_MEMBERSHIP_QUEUE, {
    connection,
  });
  let metricsTimer: NodeJS.Timeout | null = null;
  let pushTimer: NodeJS.Timeout | null = null;
  const metrics = initMetrics();
  let windowCompleted = 0;
  let windowFailed = 0;
  let consecutiveFailures = 0;
  let breakerTimer: NodeJS.Timeout | null = null;

  const emitQueueMetrics = async () => {
    try {
      const counts = await metricsQueue.getJobCounts(
        'waiting',
        'active',
        'delayed',
        'failed',
        'completed',
      );
      const totalWindow = windowCompleted + windowFailed;
      const failureRate = totalWindow > 0 ? windowFailed / totalWindow : 0;
      const warnDepth = counts.waiting > queueDepthWarn;
      const warnFailure = failureRate > failureRateWarn && totalWindow > 0;
      const logFn = warnDepth || warnFailure ? logger.warn : logger.info;

      if (metrics) {
        metrics.gauges.waiting.set(counts.waiting);
        metrics.gauges.active.set(counts.active);
        metrics.gauges.delayed.set(counts.delayed);
        metrics.gauges.failed.set(counts.failed);
        metrics.gauges.completed.set(counts.completed);
        metrics.gauges.failureRate.set(failureRate);
      }

      logFn?.(
        {
          queue: FLIGHT_PLAN_MEMBERSHIP_QUEUE,
          metrics: counts,
          windowCompleted,
          windowFailed,
          failureRate,
          intervalMs: metricsIntervalMs,
          warnDepth,
          warnFailure,
        },
        '[neo4j-worker] Queue metrics',
      );

      windowCompleted = 0;
      windowFailed = 0;
    } catch (error) {
      logger.warn?.({ err: error }, '[neo4j-worker] Failed to collect queue metrics');
    }
  };

  const pushMetrics = async () => {
    if (!metrics?.pushGateway || !metrics.pushJobName) return;
    try {
      await metrics.pushGateway.pushAdd({ jobName: metrics.pushJobName });
      logger.debug?.(
        { queue: FLIGHT_PLAN_MEMBERSHIP_QUEUE, job: metrics.pushJobName },
        '[neo4j-worker] Pushed Prometheus metrics',
      );
    } catch (error) {
      logger.warn?.({ err: error }, '[neo4j-worker] Failed to push Prometheus metrics');
    }
  };

  const worker = new Worker<FlightPlanMembershipJob>(
    FLIGHT_PLAN_MEMBERSHIP_QUEUE,
    async (job) => {
      const { data } = job;
      const attempts = job.attemptsMade + 1;
      const eventContext = {
        jobId: job.id,
        attempts,
        eventId: data.eventId ?? null,
        membershipId: data.membershipId ?? null,
      };

      const nowIso = new Date().toISOString();

      if (data.eventId != null) {
        try {
          await payloadInstance.update({
            collection: 'flight-plan-membership-events',
            id: data.eventId,
            data: {
              lockedAt: nowIso,
              attempts,
            },
            overrideAccess: true,
          });
        } catch (error) {
          logger.warn?.(
            { ...eventContext, err: error },
            '[neo4j-worker] Failed to lock membership event',
          );
        }
      }

      try {
        const membership =
          data.membershipId != null
            ? await loadMembershipById(payloadInstance, data.membershipId)
            : null;

        const projection = toProjectionPayload(data, membership);
        if (projection.flightPlanId != null) {
          await rebuildPlanRelationships(payloadInstance, projection.flightPlanId);
        }

        if (data.eventId != null) {
          await payloadInstance.update({
            collection: 'flight-plan-membership-events',
            id: data.eventId,
            data: {
              processedAt: new Date().toISOString(),
              lockedAt: null,
              lastError: null,
            },
            overrideAccess: true,
          });
        }

        logger.debug?.(
          {
            ...eventContext,
            action: projection.flightPlanId != null ? 'roster-relationship-rebuild' : 'noop',
          },
          '[neo4j-worker] Processed membership job',
        );
      } catch (error) {
        if (data.eventId != null) {
          const message = error instanceof Error ? error.message : String(error);
          try {
            await payloadInstance.update({
              collection: 'flight-plan-membership-events',
              id: data.eventId,
              data: {
                lastError: message,
                lockedAt: null,
              },
              overrideAccess: true,
            });
          } catch (updateError) {
            logger.error?.(
              { ...eventContext, err: updateError },
              '[neo4j-worker] Failed to update membership event after error',
            );
          }
        }

        logger.error?.(
          { ...eventContext, err: error },
          '[neo4j-worker] Failed to process membership job',
        );
        throw error;
      }
    },
    {
      connection,
      concurrency,
    },
  );

  worker.on('ready', () => {
    logger.info?.(
      { queue: FLIGHT_PLAN_MEMBERSHIP_QUEUE, concurrency },
      '[neo4j-worker] Worker ready',
    );
    if (!metricsTimer && metricsIntervalMs > 0) {
      metricsTimer = setInterval(() => {
        void emitQueueMetrics();
      }, metricsIntervalMs);
      metricsTimer.unref?.();
    }
    if (!pushTimer && pushIntervalMs > 0 && metrics?.pushGateway) {
      pushTimer = setInterval(() => {
        void pushMetrics();
      }, pushIntervalMs);
      pushTimer.unref?.();
    }
  });

  const pauseWorker = async (reason: string) => {
    try {
      await worker.pause(true);
      logger.warn?.({ reason }, '[neo4j-worker] Circuit breaker engaged; worker paused');
    } catch (error) {
      logger.error?.({ err: error, reason }, '[neo4j-worker] Failed to pause worker');
    }
  };

  const resumeWorker = async () => {
    try {
      await worker.resume();
      consecutiveFailures = 0;
      logger.info?.('[neo4j-worker] Circuit breaker reset; worker resumed');
    } catch (error) {
      logger.error?.({ err: error }, '[neo4j-worker] Failed to resume worker after breaker');
    }
  };

  worker.on('failed', (job, error) => {
    const context = {
      jobId: job?.id,
      eventId: job?.data.eventId ?? null,
      membershipId: job?.data.membershipId ?? null,
      attempts: job?.attemptsMade,
    };
    windowFailed += 1;
    consecutiveFailures += 1;
    logger.warn?.({ ...context, err: error, consecutiveFailures, breakerThreshold }, '[neo4j-worker] Job failed');
    if (consecutiveFailures >= breakerThreshold && breakerTimer === null) {
      void pauseWorker('consecutive-failures');
      breakerTimer = setTimeout(() => {
        breakerTimer = null;
        void resumeWorker();
      }, breakerCooldownMs);
      breakerTimer.unref?.();
    }
  });

  worker.on('completed', (job) => {
    windowCompleted += 1;
    consecutiveFailures = 0;
    logger.debug?.(
      {
        jobId: job.id,
        eventId: job.data.eventId ?? null,
        membershipId: job.data.membershipId ?? null,
      },
      '[neo4j-worker] Job completed',
    );
  });

  await worker.waitUntilReady();

  let shuttingDown = false;

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info?.('[neo4j-worker] Shutting down worker');
    if (metricsTimer) {
      clearInterval(metricsTimer);
      metricsTimer = null;
    }
    if (pushTimer) {
      clearInterval(pushTimer);
      pushTimer = null;
    }

    await Promise.allSettled([
      worker
        .close()
        .catch((error) =>
          logger.error?.({ err: error }, '[neo4j-worker] Failed to close worker'),
        ),
      queueEvents
        .close()
        .catch((error) =>
          logger.error?.({ err: error }, '[neo4j-worker] Failed to close queue events'),
        ),
      metricsQueue
        .close()
        .catch((error) =>
          logger.error?.({ err: error }, '[neo4j-worker] Failed to close metrics queue'),
        ),
      (async () => {
        const closable = payloadInstance as unknown as { close?: () => Promise<void> | void };
        if (typeof closable.close === 'function') {
          await closable.close();
        }
      })().catch((error: unknown) =>
          logger.error?.({ err: error }, '[neo4j-worker] Failed to close payload'),
      ),
      closeNeo4jDriver().catch((error) =>
        logger.error?.({ err: error }, '[neo4j-worker] Failed to close Neo4j driver'),
      ),
      metrics?.pushGateway
        ?.delete?.({ jobName: metrics.pushJobName })
        .catch((error: unknown) =>
          logger.warn?.({ err: error }, '[neo4j-worker] Failed to delete pushed metrics'),
        ),
    ]);
  };

  const handleSignal = (signal: NodeJS.Signals) => {
    logger.info?.({ signal }, '[neo4j-worker] Received exit signal');
    shutdown()
      .then(() => process.exit(0))
      .catch((error) => {
        logger.error?.({ err: error }, '[neo4j-worker] Shutdown failed');
        process.exit(1);
      });
  };

  process.on('SIGINT', handleSignal);
  process.on('SIGTERM', handleSignal);

  return {
    shutdown,
  };
};

if (import.meta.url === `file://${process.argv[1]}`) {
  startFlightPlanMembershipWorker().catch((error) => {
    console.error('[neo4j-worker] Fatal error', error);
    closeNeo4jDriver()
      .catch(() => undefined)
      .finally(() => process.exit(1));
  });
}
