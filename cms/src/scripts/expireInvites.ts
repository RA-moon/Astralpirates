process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { runInviteExpirySweep } from '../lib/inviteExpirySweep.ts';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const run = async () => {
  const instance = await payload.init({ config: payloadConfig });
  const logger = instance.logger?.child({ script: 'expire-invites' }) ?? console;

  try {
    const summary = await runInviteExpirySweep(instance, { logger });
    logger.info?.({ summary }, 'Invite expiry sweep complete');
  } finally {
    await closePayloadLifecycle(instance);
  }
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('[invites] Failed to expire invites');
    console.error(error);
    process.exit(1);
  });
