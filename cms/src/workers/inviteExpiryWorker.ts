process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import { Cron } from 'croner';
import payload from 'payload';

import payloadConfig from '@/payload.config.ts';
import { runInviteExpirySweep } from '@/src/lib/inviteExpirySweep.ts';

const CRON_SCHEDULE = '*/30 * * * *';
const CRON_TIMEZONE = 'UTC';

const shouldRunOnce =
  process.argv.includes('--run-once') ||
  process.argv.includes('--once') ||
  process.env.INVITE_EXPIRY_RUN_ONCE === 'true';

const startWorker = async () => {
  const instance = await payload.init({ config: payloadConfig });
  const logger = instance.logger?.child?.({ worker: 'invite-expiry' }) ?? instance.logger ?? console;

  const executeSweep = async () => {
    try {
      logger.info?.('[invite-expiry] Starting sweep');
      const summary = await runInviteExpirySweep(instance, { logger });
      logger.info?.({ summary }, '[invite-expiry] Sweep complete');
    } catch (error) {
      logger.error?.({ err: error }, '[invite-expiry] Sweep failed');
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
    '[invite-expiry] Scheduling periodic sweeps',
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
      '[invite-expiry] Next run scheduled',
    );
  }

  const shutdown = async () => {
    logger.info?.('[invite-expiry] Shutting down worker');
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
  console.error('[invite-expiry] Worker crashed', error);
  process.exit(1);
});
