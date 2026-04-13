import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { honorBadgesEqual, syncHonorBadges } from '../utils/honorBadges';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const BATCH_SIZE = 50;

const run = async () => {
  await payload.init({ config: payloadConfig });

  let page = 1;
  let updated = 0;
  let scanned = 0;

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
      scanned += 1;
      const desired = syncHonorBadges({ draft: user, previous: user });
      if (honorBadgesEqual((user as any).honorBadges, desired)) {
        continue;
      }

      await payload.update({
        collection: 'users',
        id: user.id,
        data: {
          honorBadges: desired,
        },
        overrideAccess: true,
      });
      updated += 1;
    }

    if (page >= result.totalPages) {
      break;
    }
    page += 1;
  }

  payload.logger.info({ scanned, updated }, 'Honor badges backfill complete');

  await closePayloadLifecycle(payload);

  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
