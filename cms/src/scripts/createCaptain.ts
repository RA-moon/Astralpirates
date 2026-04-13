import payload from 'payload';
import payloadConfig from '../../payload.config.ts';

const email = process.env.SEED_CAPTAIN_EMAIL ?? 'captain@example.com';
const password = process.env.SEED_CAPTAIN_PASSWORD;
if (!password) {
  throw new Error('Set SEED_CAPTAIN_PASSWORD before running createCaptain.');
}
const firstName = process.env.SEED_CAPTAIN_FIRST_NAME ?? 'Captain';
const lastName = process.env.SEED_CAPTAIN_LAST_NAME ?? 'Astral';

const run = async (): Promise<void> => {
  await payload.init({ config: payloadConfig });

  const existing = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: email,
      },
    },
    limit: 1,
    overrideAccess: true,
  });

  if (existing.docs.length > 0) {
    const user = existing.docs[0];
    const identityUpdates: Record<string, unknown> = {};
    if (user.firstName !== firstName) identityUpdates.firstName = firstName;
    if (user.lastName !== lastName) identityUpdates.lastName = lastName;
    await payload.update({
      collection: 'users',
      id: user.id,
      data: {
        ...identityUpdates,
        password,
        role: 'captain',
        profileSlug: 'captain',
        callSign: 'Captain',
      },
      overrideAccess: true,
      context: {
        skipProfileSlugAssignment: true,
        allowProfileSlugWrite: true,
        skipProfileSlugSync: true,
      },
    });
    payload.logger.info(`Updated password for ${email}`);
  } else {
    await payload.create({
      collection: 'users',
      data: {
        email,
        password,
        firstName,
        lastName,
        role: 'captain',
        profileSlug: 'captain',
        callSign: 'Captain',
      },
      draft: false,
      overrideAccess: true,
      context: {
        skipProfileSlugAssignment: true,
        allowProfileSlugWrite: true,
        skipProfileSlugSync: true,
      },
    });
    payload.logger.info(`Created admin user ${email}`);
  }

  payload.logger.info('Captain account ready.');
  process.exit(0);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
