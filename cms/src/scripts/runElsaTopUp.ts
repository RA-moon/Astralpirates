import payload from 'payload';
import type { Payload } from 'payload';

import payloadConfig from '../../payload.config.ts';
import {
  formatElsaTopUpSummary,
  runElsaTopUpSweep,
  type ElsaTopUpSummary,
} from '../workers/elsaTopUpHelpers';
import { isDirectExecution } from './_lib/directExecution';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const envFlagEnabled = (value?: string | null): boolean =>
  ['1', 'true', 'yes', 'on'].includes((value ?? '').toString().trim().toLowerCase());

export const isSeedTopUpEnabled = (): boolean => envFlagEnabled(process.env.CMS_SEED_TOPUP);
export const shouldSkipTopUpForEnv = (): boolean =>
  (process.env.NODE_ENV ?? '').toLowerCase() === 'test' || Boolean(process.env.VITEST);

type RunOptions = {
  payload?: Payload;
  skipInit?: boolean;
  skipShutdown?: boolean;
};

export const runElsaTopUp = async ({
  payload: payloadInstance,
  skipInit = false,
  skipShutdown = false,
}: RunOptions = {}): Promise<ElsaTopUpSummary> => {
  let instance = payloadInstance;
  let shouldShutdown = false;

  if (!instance) {
    if (skipInit) {
      throw new Error('Payload instance is required when skipInit is true for ELSA top-ups.');
    }
    instance = await payload.init({ config: payloadConfig });
    shouldShutdown = !skipShutdown;
  }

  const summary = await runElsaTopUpSweep(instance);

  if (shouldShutdown) {
    await closePayloadLifecycle(instance, 'shutdown-first');
  }

  return summary;
};

export const maybeRunElsaTopUp = async (
  options: RunOptions & { reason?: string } = {},
): Promise<{ skipped: true; reason: string } | { skipped: false; summary: ElsaTopUpSummary }> => {
  if (!isSeedTopUpEnabled()) {
    return { skipped: true, reason: 'flag-disabled' };
  }
  if (shouldSkipTopUpForEnv()) {
    return { skipped: true, reason: 'test-env' };
  }

  const summary = await runElsaTopUp(options);
  return { skipped: false, summary };
};

if (isDirectExecution(import.meta.url)) {
  maybeRunElsaTopUp()
    .then((result) => {
      if (result.skipped) {
        console.warn(`[elsa-top-up] skipped (${result.reason}) — set CMS_SEED_TOPUP=1 to enable`);
        process.exitCode = 0;
        return;
      }
      console.log(formatElsaTopUpSummary(result.summary));
      process.exitCode = 0;
    })
    .catch((error) => {
      console.error('[elsa-top-up] failed', error);
      process.exitCode = 1;
    });
}
