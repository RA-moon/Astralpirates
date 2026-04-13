process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import { Cron } from 'croner';
import payload from 'payload';

import payloadConfig from '@/payload.config.ts';
import {
  cleanupExpiredEditorWriteIdempotency,
  resolveEditorIdempotencyCleanupBatchSize,
  resolveEditorIdempotencyCleanupMaxBatches,
  resolveEditorIdempotencyRetentionDays,
} from '@/app/api/_lib/editorWrites';

const DEFAULT_CRON_SCHEDULE = '35 2 * * *';
const DEFAULT_CRON_TIMEZONE = 'UTC';

const CRON_SCHEDULE =
  process.env.EDITOR_WRITE_IDEMPOTENCY_CLEANUP_CRON?.trim() || DEFAULT_CRON_SCHEDULE;
const CRON_TIMEZONE =
  process.env.EDITOR_WRITE_IDEMPOTENCY_CLEANUP_TIMEZONE?.trim() || DEFAULT_CRON_TIMEZONE;
const RUN_ON_START = process.env.EDITOR_WRITE_IDEMPOTENCY_CLEANUP_RUN_ON_START === 'true';

const isTestEnv =
  (process.env.NODE_ENV ?? '').toLowerCase() === 'test' || Boolean(process.env.VITEST);
const shouldRunOnce =
  process.argv.includes('--run-once') ||
  process.argv.includes('--once') ||
  process.env.EDITOR_WRITE_IDEMPOTENCY_RUN_ONCE === 'true';
const shouldStartWorker =
  !isTestEnv && process.env.EDITOR_WRITE_IDEMPOTENCY_SKIP_WORKER !== 'true';

const runCleanupSweep = async (instance: Awaited<ReturnType<typeof payload.init>>) => {
  const logger =
    instance.logger?.child?.({ worker: 'editor-idempotency-retention' }) ??
    instance.logger ??
    console;

  const summary = await cleanupExpiredEditorWriteIdempotency({
    payload: instance,
    retentionDays: resolveEditorIdempotencyRetentionDays(),
    batchSize: resolveEditorIdempotencyCleanupBatchSize(),
    maxBatches: resolveEditorIdempotencyCleanupMaxBatches(),
  });

  logger.info?.(
    {
      retentionDays: summary.retentionDays,
      batchSize: summary.batchSize,
      maxBatches: summary.maxBatches,
      deletedCount: summary.deletedCount,
      reachedBatchLimit: summary.reachedBatchLimit,
    },
    '[editor-idempotency] cleanup sweep complete',
  );

  if (summary.reachedBatchLimit) {
    logger.warn?.(
      {
        retentionDays: summary.retentionDays,
        batchSize: summary.batchSize,
        maxBatches: summary.maxBatches,
        deletedCount: summary.deletedCount,
      },
      '[editor-idempotency] cleanup hit batch limit; rerun or increase max batches',
    );
  }
};

const startWorker = async () => {
  const instance = await payload.init({ config: payloadConfig });
  const logger =
    instance.logger?.child?.({ worker: 'editor-idempotency-retention' }) ??
    instance.logger ??
    console;

  const run = async () => {
    try {
      await runCleanupSweep(instance);
    } catch (error) {
      logger.error?.({ err: error }, '[editor-idempotency] cleanup sweep failed');
    }
  };

  if (shouldRunOnce) {
    await run();
    const closable = instance as unknown as { shutdown?: () => Promise<void> | void };
    if (typeof closable.shutdown === 'function') {
      await closable.shutdown();
    }
    process.exit(0);
  }

  if (RUN_ON_START) {
    logger.info?.('[editor-idempotency] running startup cleanup sweep');
    await run();
  }

  logger.info?.(
    { schedule: CRON_SCHEDULE, timezone: CRON_TIMEZONE },
    '[editor-idempotency] scheduling cleanup sweeps',
  );

  const job = new Cron(
    CRON_SCHEDULE,
    { timezone: CRON_TIMEZONE },
    async () => {
      await run();
    },
  );

  const nextRun = job.nextRun();
  if (nextRun) {
    logger.info?.(
      { nextRun: typeof nextRun.toISOString === 'function' ? nextRun.toISOString() : String(nextRun) },
      '[editor-idempotency] next run scheduled',
    );
  }

  const shutdown = async () => {
    logger.info?.('[editor-idempotency] shutting down worker');
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

if (shouldStartWorker) {
  startWorker().catch((error) => {
    console.error('[editor-idempotency] worker crashed', error);
    process.exit(1);
  });
}
