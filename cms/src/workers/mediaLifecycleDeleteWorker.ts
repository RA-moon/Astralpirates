process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import { Cron } from 'croner';
import payload from 'payload';

import payloadConfig from '@/payload.config.ts';
import { processMediaDeleteQueueOnce } from '@/src/services/mediaLifecycle';

const DEFAULT_CRON_SCHEDULE = '*/2 * * * *';
const DEFAULT_CRON_TIMEZONE = 'UTC';
const DEFAULT_BATCH_SIZE = 20;

const CRON_SCHEDULE =
  process.env.MEDIA_DELETE_WORKER_CRON?.trim() || DEFAULT_CRON_SCHEDULE;
const CRON_TIMEZONE =
  process.env.MEDIA_DELETE_WORKER_TIMEZONE?.trim() || DEFAULT_CRON_TIMEZONE;
const RUN_ON_START = process.env.MEDIA_DELETE_WORKER_RUN_ON_START !== 'false';
const BATCH_SIZE = (() => {
  const parsed = Number.parseInt(
    process.env.MEDIA_DELETE_WORKER_BATCH_SIZE ?? `${DEFAULT_BATCH_SIZE}`,
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BATCH_SIZE;
})();

const shouldRunOnce =
  process.argv.includes('--run-once') ||
  process.argv.includes('--once') ||
  process.env.MEDIA_DELETE_WORKER_RUN_ONCE === 'true';

const runSweep = async (instance: Awaited<ReturnType<typeof payload.init>>) => {
  const logger = instance.logger?.child?.({ worker: 'media-delete' }) ?? instance.logger ?? console;

  try {
    const summary = await processMediaDeleteQueueOnce({
      payload: instance,
      limit: BATCH_SIZE,
    });

    logger.info?.(
      {
        batchSize: BATCH_SIZE,
        scanned: summary.scanned,
        succeeded: summary.succeeded,
        retried: summary.retried,
        deadLettered: summary.deadLettered,
      },
      '[media-delete] queue sweep complete',
    );
  } catch (error) {
    logger.error?.({ err: error }, '[media-delete] queue sweep failed');
  }
};

const startWorker = async () => {
  const instance = await payload.init({ config: payloadConfig });
  const logger = instance.logger?.child?.({ worker: 'media-delete' }) ?? instance.logger ?? console;

  if (shouldRunOnce) {
    await runSweep(instance);
    const closable = instance as unknown as { shutdown?: () => Promise<void> | void };
    if (typeof closable.shutdown === 'function') {
      await closable.shutdown();
    }
    process.exit(0);
  }

  if (RUN_ON_START) {
    logger.info?.('[media-delete] running startup queue sweep');
    await runSweep(instance);
  }

  logger.info?.(
    {
      schedule: CRON_SCHEDULE,
      timezone: CRON_TIMEZONE,
      batchSize: BATCH_SIZE,
    },
    '[media-delete] scheduling queue sweeps',
  );

  const job = new Cron(
    CRON_SCHEDULE,
    { timezone: CRON_TIMEZONE },
    async () => {
      await runSweep(instance);
    },
  );

  const nextRun = job.nextRun();
  if (nextRun) {
    logger.info?.(
      { nextRun: typeof nextRun.toISOString === 'function' ? nextRun.toISOString() : String(nextRun) },
      '[media-delete] next run scheduled',
    );
  }

  const shutdown = async () => {
    logger.info?.('[media-delete] shutting down worker');
    job.stop();
    const closable = instance as unknown as { shutdown?: () => Promise<void> | void };
    if (typeof closable.shutdown === 'function') {
      await closable.shutdown();
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

startWorker().catch((error) => {
  console.error('[media-delete] worker crashed', error);
  process.exit(1);
});
