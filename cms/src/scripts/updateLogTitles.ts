import payload from 'payload';
import { formatLogCode, formatTimestamp } from '@astralpirates/shared/logs';

import payloadConfig from '../../payload.config';

const SPECIAL_SLUG = '20251030180803';

const needsTitle = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value !== 'string') return true;
  return value.trim().length === 0;
};

const deriveFallbackHeadline = (
  doc: { dateCode?: string | null; createdAt?: string | null; slug?: string | null },
): string => {
  const code = formatLogCode(doc);
  if (code && code !== '00000000000000') {
    return code;
  }
  const slug = typeof doc.slug === 'string' ? doc.slug.trim() : '';
  if (slug) {
    return slug;
  }
  return formatTimestamp(new Date());
};

const run = async () => {
  await payload.init({ config: payloadConfig });

  const special = await payload.find({
    collection: 'logs',
    where: { slug: { equals: SPECIAL_SLUG } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const specialDoc = special.docs[0];
  if (specialDoc) {
    await payload.update({
      collection: 'logs',
      id: specialDoc.id,
      data: { headline: '0.4' },
      overrideAccess: true,
    });
  }

  let page = 1;
  const pageSize = 100;
  while (true) {
    const result = await payload.find({
      collection: 'logs',
      limit: pageSize,
      page,
      depth: 0,
      overrideAccess: true,
    });

    for (const doc of result.docs) {
      if (needsTitle((doc as { headline?: unknown }).headline)) {
        const fallbackHeadline = deriveFallbackHeadline(
          doc as { dateCode?: string | null; createdAt?: string | null; slug?: string | null },
        );
        await payload.update({
          collection: 'logs',
          id: doc.id,
          data: { headline: fallbackHeadline },
          overrideAccess: true,
        });
      }
    }

    const totalPages = result.totalPages ?? page;
    if (page >= totalPages) break;
    page += 1;
  }

  process.exit(0);
};

run().catch((error) => {
  console.error('[scripts/updateLogTitles] Failed to update log titles', error);
  process.exit(1);
});
