process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import payload from 'payload';
import payloadConfig from '../../payload.config.ts';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const run = async () => {
  await payload.init({ config: payloadConfig });
  try {
    const result = await payload.find({
      collection: 'users',
      depth: 0,
      overrideAccess: true,
      limit: 200,
      sort: 'id',
    });
    for (const doc of result.docs) {
      const invitedBy = (() => {
        const value = doc.invitedBy as any;
        if (!value) return 'null';
        if (typeof value === 'object' && value.id != null) return String(value.id);
        return String(value);
      })();
      console.log(`${doc.id}\t${doc.email}\t${invitedBy}`);
    }
  } finally {
    await closePayloadLifecycle(payload);
  }
  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
