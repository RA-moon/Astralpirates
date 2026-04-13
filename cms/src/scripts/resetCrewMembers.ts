import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { crewProfiles } from './crewProfiles';
import { seedUsers } from './seedUsers';
import { closeNeo4jDriver } from '../utils/neo4j';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const resetCrewMembers = async (): Promise<void> => {
  const payloadInstance = await payload.init({ config: payloadConfig });

  try {
    for (const profile of crewProfiles) {
      const existing = await payloadInstance.find({
        collection: 'users',
        where: {
          email: { equals: profile.email },
        },
        limit: 1,
        overrideAccess: true,
      });

      const user = existing.docs[0];
      if (!user) {
        payload.logger.info({ email: profile.email }, 'Crew member not found; skipping delete');
        continue;
      }

      await payloadInstance.delete({
        collection: 'users',
        id: user.id,
        overrideAccess: true,
      });

      payload.logger.info({ email: profile.email }, 'Deleted crew member');
    }

    await seedUsers({ skipInit: true, skipShutdown: true });
    payload.logger.info('Re-seeded crew members from crewProfiles.ts');
  } finally {
    await closePayloadLifecycle(payloadInstance);

    await closeNeo4jDriver();
  }
};

resetCrewMembers().catch((error) => {
  console.error('Failed to reset crew members');
  console.error(error);
  process.exitCode = 1;
});
