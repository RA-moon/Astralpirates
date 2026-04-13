import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const isBlank = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value !== 'string') return false;
  return value.trim().length === 0;
};

const run = async (): Promise<void> => {
  await payload.init({ config: payloadConfig });

  try {
    const result = await payload.find({
      collection: 'users',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
      sort: '-updatedAt',
    });

    const report = result.docs
      .map((doc) => {
        const missing: string[] = [];
        if (isBlank((doc as any).firstName)) missing.push('firstName');
        if (isBlank((doc as any).lastName)) missing.push('lastName');
        if (isBlank(doc.email)) missing.push('email');
        return {
          id: doc.id,
          email: doc.email,
          profileSlug: doc.profileSlug ?? null,
          callSign: (doc as any).callSign ?? null,
          missing,
        };
      })
      .filter((entry) => entry.missing.length > 0);

    if (report.length === 0) {
      console.log('All crew identities are complete.');
      return;
    }

    console.log('Crew members missing immutable identity fields:');
    console.log('');
    report.forEach((entry) => {
      const labels = entry.missing.join(', ');
      console.log(`- id=${entry.id} email=${entry.email} slug=${entry.profileSlug ?? '—'} callSign=${entry.callSign ?? '—'} :: missing ${labels}`);
    });
  } finally {
    await closePayloadLifecycle(payload);
  }
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
