import payload from 'payload';
import payloadConfig from '../../payload.config.ts';
import { sanitiseLayout } from '../utils/cleanPageLayout';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

type PageDoc = {
  id: number | string;
  layout?: Record<string, unknown>[];
};

const run = async (): Promise<void> => {
  await payload.init({ config: payloadConfig });

  const pageResult = await payload.find({
    collection: 'pages',
    limit: 100,
    depth: 0,
    overrideAccess: true,
  });

  for (const doc of pageResult.docs as PageDoc[]) {
    const cleanedLayout = sanitiseLayout(doc.layout as Record<string, unknown>[] | undefined);
    await payload.update({
      collection: 'pages',
      id: doc.id,
      data: { layout: cleanedLayout },
      overrideAccess: true,
    });
  }

  console.log(`Sanitised ${pageResult.totalDocs} page documents.`);

  await closePayloadLifecycle(payload);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
