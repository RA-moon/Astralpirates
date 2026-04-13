import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const listCrew = async (): Promise<void> => {
  const payloadInstance = await payload.init({
    config: payloadConfig,
  });

  try {
    const result = await payloadInstance.find({
      collection: 'users',
      limit: 250,
      depth: 0,
      overrideAccess: true,
      sort: 'email',
    });

    if (result.docs.length === 0) {
      console.log('No crew members found.');
      return;
    }

    const summary = result.docs.map((doc) => ({
      id: doc.id,
      email: doc.email,
      firstName: doc.firstName ?? null,
      lastName: doc.lastName ?? null,
      role: doc.role ?? null,
      profileSlug: doc.profileSlug ?? null,
    }));

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await closePayloadLifecycle(payloadInstance);
  }
};

listCrew().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
