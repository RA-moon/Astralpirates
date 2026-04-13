import { getPayload } from 'payload';

import config from '../../../payload.config.ts';

const payload = await getPayload({ config });
const stamp = Date.now();
const pagePath = `ci/page-carousel-smoke-${stamp}`;

let createdPageId: number | string | null = null;

try {
  const page = await payload.create({
    collection: 'pages',
    data: {
      title: `Page carousel smoke ${stamp}`,
      path: pagePath,
      layout: [
        {
          blockType: 'imageCarousel',
          title: 'Smoke carousel',
          slides: [
            {
              title: 'Smoke slide',
              imageAlt: 'Smoke test image',
              imageType: 'url',
              imageUrl: 'https://example.com/smoke-slide.png',
              caption: 'Schema validation smoke',
            },
          ],
        },
      ],
    },
    overrideAccess: true,
  });

  createdPageId = page.id;

  const result = await payload.find({
    collection: 'pages',
    where: {
      path: {
        equals: pagePath,
      },
    },
    depth: 1,
    limit: 1,
    overrideAccess: true,
  });

  const fetched = (result.docs[0] ?? null) as Record<string, unknown> | null;
  if (!fetched) {
    throw new Error('[page-carousel-smoke] failed to read created page.');
  }

  const layout = Array.isArray(fetched.layout) ? fetched.layout : [];
  const carousel = layout.find(
    (block): block is Record<string, unknown> =>
      !!block && typeof block === 'object' && (block as { blockType?: unknown }).blockType === 'imageCarousel',
  );

  if (!carousel) {
    throw new Error('[page-carousel-smoke] fetched page is missing the imageCarousel block.');
  }

  const slides = Array.isArray(carousel.slides) ? carousel.slides : [];
  const firstSlide = (slides[0] ?? null) as Record<string, unknown> | null;
  if (!firstSlide) {
    throw new Error('[page-carousel-smoke] fetched carousel has no slides.');
  }

  if (firstSlide.title !== 'Smoke slide') {
    throw new Error('[page-carousel-smoke] slide title did not round-trip as expected.');
  }

  if (firstSlide.imageType !== 'url') {
    throw new Error('[page-carousel-smoke] slide imageType did not round-trip as expected.');
  }

  console.log(`[page-carousel-smoke] created and fetched page at path "${pagePath}"`);
} finally {
  if (createdPageId != null) {
    await payload
      .delete({
        collection: 'pages',
        id: createdPageId,
        overrideAccess: true,
      })
      .catch(() => null);
  }
}

process.exit(0);
