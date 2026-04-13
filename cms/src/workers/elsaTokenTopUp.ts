process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import { Cron } from 'croner';
import payload from 'payload';
import type { Payload } from 'payload';

import payloadConfig from '@/payload.config.ts';
import { calculateElsaTopUp, runElsaTopUpSweep } from './elsaTopUpHelpers';

const CRON_SCHEDULE = '59 23 * * 0';
const CRON_TIMEZONE = 'UTC';

const isTestEnv =
  (process.env.NODE_ENV ?? '').toLowerCase() === 'test' || Boolean(process.env.VITEST);
const shouldRunOnce =
  process.argv.includes('--run-once') ||
  process.argv.includes('--once') ||
  process.env.ELSA_TOPUP_RUN_ONCE === 'true';
const shouldStartWorker = !isTestEnv && process.env.ELSA_TOPUP_SKIP_WORKER !== 'true';

const startWorker = async () => {
  const instance = await payload.init({ config: payloadConfig });
  const logger = instance.logger?.child?.({ worker: 'elsa-top-up' }) ?? instance.logger ?? console;

  const executeSweep = async () => {
    try {
      logger.info?.('[elsa-top-up] Starting token sweep');
      await runElsaTopUpSweep(instance);
    } catch (error) {
      logger.error?.({ err: error }, '[elsa-top-up] Sweep failed');
    }
  };

  if (shouldRunOnce) {
    await executeSweep();
    const closable = instance as unknown as { shutdown?: () => Promise<void> | void };
    if (typeof closable.shutdown === 'function') {
      await closable.shutdown();
    }
    process.exit(0);
  }

  logger.info?.(
    { schedule: CRON_SCHEDULE, timezone: CRON_TIMEZONE },
    '[elsa-top-up] Scheduling weekly sweeps',
  );

  const job = new Cron(
    CRON_SCHEDULE,
    { timezone: CRON_TIMEZONE },
    async () => {
      await executeSweep();
    },
  );

  const nextRun = job.nextRun();
  if (nextRun) {
    logger.info?.(
      { nextRun: typeof nextRun.toISOString === 'function' ? nextRun.toISOString() : String(nextRun) },
      '[elsa-top-up] Next run scheduled',
    );
  }

  const shutdown = async () => {
    logger.info?.('[elsa-top-up] Shutting down worker');
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
    console.error('[elsa-top-up] Worker crashed', error);
    process.exit(1);
  });
}

export { calculateElsaTopUp, runElsaTopUpSweep };
