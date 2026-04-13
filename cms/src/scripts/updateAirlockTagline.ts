import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const NEW_TAGLINE = 'We manifest the next golden age of priacy!';

type HeroBlock = {
  blockType?: string;
  tagline?: unknown;
};

const isHeroBlock = (block: unknown): block is HeroBlock =>
  Boolean(block && typeof block === 'object' && (block as HeroBlock).blockType === 'hero');

const buildTaglineContent = () => [
  {
    type: 'paragraph',
    children: [
      {
        text: NEW_TAGLINE,
      },
    ],
  },
];

const run = async (): Promise<void> => {
  await payload.init({ config: payloadConfig });

  const pages = await payload.find({
    collection: 'pages',
    where: {
      path: {
        equals: '/',
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (!pages.docs.length) {
    throw new Error('Airlock page (path "/") was not found.');
  }

  const document = pages.docs[0];
  const layout = Array.isArray(document.layout) ? [...document.layout] : [];
  const heroIndex = layout.findIndex(isHeroBlock);

  if (heroIndex === -1) {
    throw new Error('Airlock page does not contain a hero block to update.');
  }

  const hero = { ...(layout[heroIndex] as HeroBlock) };
  hero.tagline = buildTaglineContent();
  layout[heroIndex] = hero;

  await payload.update({
    collection: 'pages',
    id: document.id,
    data: {
      layout,
    },
    overrideAccess: true,
  });

  console.log('Updated Airlock tagline to:', NEW_TAGLINE);

  await closePayloadLifecycle(payload);
};

run().catch((error) => {
  console.error('[updateAirlockTagline] failed', error);
  process.exitCode = 1;
});
