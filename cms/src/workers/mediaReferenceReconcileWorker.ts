process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import { Cron } from 'croner';
import payload from 'payload';

import payloadConfig from '@/payload.config.ts';
import { reconcileAllMediaReferences } from '@/src/services/mediaLifecycle';

const DEFAULT_CRON_SCHEDULE = '45 3 * * *';
const DEFAULT_CRON_TIMEZONE = 'UTC';

const CRON_SCHEDULE =
  process.env.MEDIA_REFERENCE_RECONCILE_CRON?.trim() || DEFAULT_CRON_SCHEDULE;
const CRON_TIMEZONE =
  process.env.MEDIA_REFERENCE_RECONCILE_TIMEZONE?.trim() || DEFAULT_CRON_TIMEZONE;
const RUN_ON_START = process.env.MEDIA_REFERENCE_RECONCILE_RUN_ON_START === 'true';
const PAGE_SIZE = (() => {
  const parsed = Number.parseInt(process.env.MEDIA_REFERENCE_RECONCILE_PAGE_SIZE ?? '50', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
})();

const shouldRunOnce =
  process.argv.includes('--run-once') ||
  process.argv.includes('--once') ||
  process.env.MEDIA_REFERENCE_RECONCILE_RUN_ONCE === 'true';

const runSweep = async (instance: Awaited<ReturnType<typeof payload.init>>) => {
  const logger =
    instance.logger?.child?.({ worker: 'media-reference-reconcile' }) ??
    instance.logger ??
    console;

  try {
    const summary = await reconcileAllMediaReferences(instance, {
      dryRun: false,
      pageSize: PAGE_SIZE,
      logger,
    });
    logger.info?.({ summary }, '[media-reference-reconcile] reconcile sweep complete');
  } catch (error) {
    logger.error?.({ err: error }, '[media-reference-reconcile] reconcile sweep failed');
  }
};

const startWorker = async () => {
  const instance = await payload.init({ config: payloadConfig });
  const logger =
    instance.logger?.child?.({ worker: 'media-reference-reconcile' }) ??
    instance.logger ??
    console;

  if (shouldRunOnce) {
    await runSweep(instance);
    const closable = instance as unknown as { shutdown?: () => Promise<void> | void };
    if (typeof closable.shutdown === 'function') {
      await closable.shutdown();
    }
    process.exit(0);
  }

  if (RUN_ON_START) {
    logger.info?.('[media-reference-reconcile] running startup reconcile sweep');
    await runSweep(instance);
  }

  logger.info?.(
    { schedule: CRON_SCHEDULE, timezone: CRON_TIMEZONE, pageSize: PAGE_SIZE },
    '[media-reference-reconcile] scheduling reconcile sweeps',
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
      '[media-reference-reconcile] next run scheduled',
    );
  }

  const shutdown = async () => {
    logger.info?.('[media-reference-reconcile] shutting down worker');
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
  console.error('[media-reference-reconcile] worker crashed', error);
  process.exit(1);
});
