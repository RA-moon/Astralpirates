import payload from 'payload';
import payloadConfig from '../../payload.config.ts';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const BATCH_SIZE = 25;

const run = async (): Promise<void> => {
  await payload.init({ config: payloadConfig });

  let page = 1;
  let processed = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await payload.find({
      collection: 'users',
      depth: 0,
      page,
      limit: BATCH_SIZE,
      overrideAccess: true,
    });

    if (result.docs.length === 0) break;

    for (const user of result.docs) {
      await payload.update({
        collection: 'users',
        id: user.id,
        data: {},
        overrideAccess: true,
      });
      processed += 1;
    }

    if (page >= result.totalPages) {
      break;
    }

    page += 1;
  }

  payload.logger.info({ processed }, 'Backfilled profile slugs');

  await closePayloadLifecycle(payload);

  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
