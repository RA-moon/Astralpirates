import payload from 'payload';

import {
  resolveScriptRunProfile,
  runDatabasePreflight,
} from '@/src/scripts/_lib/dbPreflight.ts';
import {
  deriveFlightPlanVisibility,
  resolveFlightPlanPolicy,
  type AccessPolicy,
} from '@astralpirates/shared/accessPolicy';

const ROLE_AUTH_POLICY: AccessPolicy = {
  mode: 'role',
  roleSpace: 'crew',
  minimumRole: 'swabbie',
};

const toKey = (value: unknown): string => JSON.stringify(value ?? null);

const main = async () => {
  const runProfile = resolveScriptRunProfile();
  process.env.NODE_ENV = process.env.NODE_ENV ?? (runProfile === 'prod' ? 'production' : 'development');

  const preflight = await runDatabasePreflight({
    runProfile,
    scriptName: 'access-policy-backfill',
    requiredTables: ['pages', 'roadmap_tiers', 'flight_plans'],
  });
  preflight.warnings.forEach((warning) => {
    // eslint-disable-next-line no-console
    console.warn(warning);
  });
  // eslint-disable-next-line no-console
  console.info(
    `[access-policy-backfill] DB target ${preflight.target.host}:${preflight.target.port}/${preflight.target.database} (profile=${preflight.runProfile}, runtime=${preflight.runtime})`,
  );

  const payloadConfig = (await import('@/payload.config.ts')).default;
  const payloadInstance = await payload.init({ config: payloadConfig });
  const logger = payloadInstance.logger?.child({ script: 'access-policy-backfill' }) ?? console;

  const summary = {
    pages: { updated: 0, skipped: 0 },
    roadmapTiers: { updated: 0, skipped: 0 },
    flightPlans: { updated: 0, skipped: 0 },
  };

  let page = 1;
  while (true) {
    const result = await payloadInstance.find({
      collection: 'pages',
      limit: 100,
      page,
      depth: 0,
      select: {
        id: true,
        accessPolicy: true,
      },
      overrideAccess: true,
    });

    for (const doc of result.docs as Array<Record<string, unknown>>) {
      if (doc.accessPolicy) {
        summary.pages.skipped += 1;
        continue;
      }

      await payloadInstance.update({
        collection: 'pages',
        id: doc.id as number | string,
        data: {
          accessPolicy: { mode: 'public' },
        },
        overrideAccess: true,
      });
      summary.pages.updated += 1;
    }

    if ((result.page ?? page) >= (result.totalPages ?? page)) break;
    page += 1;
  }

  page = 1;
  while (true) {
    const result = await payloadInstance.find({
      collection: 'roadmap-tiers',
      limit: 100,
      page,
      depth: 0,
      select: {
        id: true,
        accessPolicy: true,
        items: true,
      },
      overrideAccess: true,
    });

    for (const doc of result.docs as Array<Record<string, unknown>>) {
      const currentTierPolicy = doc.accessPolicy ?? null;
      const nextTierPolicy = currentTierPolicy ?? ROLE_AUTH_POLICY;

      const items = Array.isArray(doc.items) ? doc.items : [];
      const nextItems = items.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const record = item as Record<string, unknown>;
        return {
          ...record,
          accessPolicy: record.accessPolicy ?? null,
        };
      });

      const changed =
        toKey(currentTierPolicy) !== toKey(nextTierPolicy) ||
        toKey(items) !== toKey(nextItems);

      if (!changed) {
        summary.roadmapTiers.skipped += 1;
        continue;
      }

      await payloadInstance.update({
        collection: 'roadmap-tiers',
        id: doc.id as number | string,
        data: {
          accessPolicy: nextTierPolicy,
          items: nextItems,
        },
        overrideAccess: true,
      });
      summary.roadmapTiers.updated += 1;
    }

    if ((result.page ?? page) >= (result.totalPages ?? page)) break;
    page += 1;
  }

  page = 1;
  while (true) {
    const result = await payloadInstance.find({
      collection: 'flight-plans',
      limit: 100,
      page,
      depth: 0,
      select: {
        id: true,
        accessPolicy: true,
        visibility: true,
        isPublic: true,
        publicContributions: true,
      },
      overrideAccess: true,
    });

    for (const doc of result.docs as Array<Record<string, unknown>>) {
      const accessPolicy = resolveFlightPlanPolicy({
        policy: doc.accessPolicy,
        visibility: doc.visibility,
        isPublic: doc.isPublic,
        publicContributions: doc.publicContributions,
      });
      const visibility = deriveFlightPlanVisibility(accessPolicy);
      const changed =
        toKey(doc.accessPolicy) !== toKey(accessPolicy) ||
        toKey(doc.visibility) !== toKey(visibility) ||
        toKey(doc.isPublic) !== toKey(visibility === 'public');

      if (!changed) {
        summary.flightPlans.skipped += 1;
        continue;
      }

      await payloadInstance.update({
        collection: 'flight-plans',
        id: doc.id as number | string,
        data: {
          accessPolicy,
          visibility,
          isPublic: visibility === 'public',
        },
        overrideAccess: true,
      });
      summary.flightPlans.updated += 1;
    }

    if ((result.page ?? page) >= (result.totalPages ?? page)) break;
    page += 1;
  }

  logger.info?.(summary, '[access-policy-backfill] completed');

  await payloadInstance.db?.destroy?.().catch(() => null);
};

main()
  .then(() => {
    // eslint-disable-next-line no-console
    console.log('Access policy backfill complete.');
    process.exit(0);
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[access-policy-backfill] failed', error);
    process.exit(1);
  });
