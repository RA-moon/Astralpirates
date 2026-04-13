import payload from 'payload';

import payloadConfig from '../../payload.config';

const CATEGORIES = new Set(['test', 'project', 'event']);

const run = async () => {
  await payload.init({
    config: payloadConfig,
  });

  const pageSize = 100;
  let page = 1;
  let updated = 0;
  let scanned = 0;

  while (true) {
    const result = await payload.find({
      collection: 'flight-plans',
      page,
      limit: pageSize,
      depth: 0,
      overrideAccess: true,
    });

    scanned += result.docs.length;

    for (const doc of result.docs as any[]) {
      const category = typeof doc?.category === 'string' ? doc.category.trim().toLowerCase() : '';
      if (CATEGORIES.has(category)) {
        continue;
      }
      try {
        await payload.update({
          collection: 'flight-plans',
          id: doc.id,
          data: { category: 'project' },
          overrideAccess: true,
        });
        updated += 1;
        payload.logger?.info?.(
          { id: doc.id, slug: doc.slug },
          '[backfill] set flight-plan category to project',
        );
      } catch (error) {
        payload.logger?.error?.({ err: error, id: doc.id, slug: doc.slug }, '[backfill] failed to set category');
      }
    }

    const current = result.page ?? page;
    const totalPages = result.totalPages ?? current;
    if (current >= totalPages) break;
    page = current + 1;
    if (page > 1000) break;
  }

  payload.logger?.info?.({ scanned, updated }, '[backfill] flight plan categories complete');
  process.exit(0);
};

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('backfillFlightPlanCategories failed', error);
  process.exit(1);
});
