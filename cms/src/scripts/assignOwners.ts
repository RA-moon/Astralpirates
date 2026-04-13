import payload from 'payload';
import payloadConfig from '../../payload.config.ts';

const collections = ['flight-plans', 'logs'] as const;

const run = async (): Promise<void> => {
  await payload.init({ config: payloadConfig });

  const captains = await payload.find({
    collection: 'users',
    where: {
      role: { equals: 'captain' },
    },
    limit: 1,
    overrideAccess: true,
  });

  const captain = captains.docs[0];
  if (!captain) {
    throw new Error('Captain user not found; cannot assign owners.');
  }

  for (const collection of collections) {
    let hasMore = true;
    let page = 1;

    while (hasMore) {
      const result = await payload.find({
        collection,
        page,
        limit: 50,
        where: {
          owner: {
            exists: false,
          },
        },
        overrideAccess: true,
      });

      if (result.docs.length === 0) {
        hasMore = false;
        break;
      }

      for (const doc of result.docs) {
        await payload.update({
          collection,
          id: doc.id,
          data: {
            owner: captain.id,
          },
          overrideAccess: true,
        });
        payload.logger.info({ collection, id: doc.id }, 'Assigned owner to document');
      }

      page += 1;
      hasMore = page <= result.totalPages;
    }
  }

  payload.logger.info('Owner assignment complete.');
  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
