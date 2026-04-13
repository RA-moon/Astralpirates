import { describe, it, expect } from 'vitest';

import { PageDocumentSchema, RichTextContentSchema } from '@astralpirates/shared/api-contracts';

describe('RichTextContentSchema', () => {
  it('parses legacy arrays without modification', () => {
    const legacy = [
      { type: 'paragraph', children: [{ text: 'Hello world' }] },
      { type: 'ul', children: [{ type: 'li', children: [{ text: 'Item' }] }] },
    ];

    const result = RichTextContentSchema.parse(legacy);

    expect(result).toEqual(legacy);
  });

  it('converts Lexical documents into legacy rich text nodes', () => {
    const lexical = {
      root: {
        type: 'root',
        children: [
          {
            type: 'heading',
            tag: 'h2',
            children: [{ type: 'text', text: 'Bridge', format: 1 }],
          },
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Line one' },
              { type: 'linebreak' },
              { type: 'text', text: 'Line two' },
            ],
          },
          {
            type: 'list',
            listType: 'bullet',
            children: [
              {
                type: 'listitem',
                children: [
                  {
                    type: 'listitemchild',
                    children: [{ type: 'text', text: 'Crew', format: 2 }],
                  },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            children: [
              {
                type: 'link',
                url: 'https://astralpirates.com',
                target: '_blank',
                children: [{ type: 'text', text: 'Visit', format: 'underline' }],
              },
            ],
          },
        ],
      },
    };

    const result = RichTextContentSchema.parse(lexical);

    expect(result).toEqual([
      {
        type: 'h2',
        children: [{ text: 'Bridge', bold: true }],
      },
      {
        type: 'paragraph',
        children: [{ text: 'Line one' }, { text: '\n' }, { text: 'Line two' }],
      },
      {
        type: 'ul',
        children: [
          {
            type: 'li',
            children: [{ text: 'Crew', italic: true }],
          },
        ],
      },
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: 'https://astralpirates.com',
            newTab: true,
            children: [{ text: 'Visit', underline: true }],
          },
        ],
      },
    ]);
  });

  it('normalises nullish values to empty arrays', () => {
    expect(RichTextContentSchema.parse(null)).toEqual([]);
    expect(RichTextContentSchema.parse(undefined)).toEqual([]);
  });
});

describe('PageDocumentSchema', () => {
  it('normalises scalar owner relation values to null', () => {
    const doc = {
      id: 'owner-fallback',
      title: 'Airlock',
      path: '/',
      owner: 63,
      layout: [{ blockType: 'hero', title: 'Hero', body: [] }],
    };

    const parsed = PageDocumentSchema.parse(doc);
    expect(parsed.owner).toBeNull();
  });

  it('removes invalid CTA entries before validation', () => {
    const doc = {
      id: '1',
      title: 'Airlock',
      path: '/',
      layout: [
        { blockType: 'hero', title: 'Hero', body: [] },
        {
          blockType: 'ctaList',
          title: 'Get involved',
          items: [
            {
              title: 'Invalid entry',
              description: [],
              cta: { label: null, href: null, style: null },
            },
            {
              title: 'Valid entry',
              description: [],
              cta: { label: 'Learn more', href: '/about', style: 'primary' },
            },
          ],
        },
        {
          blockType: 'cardGrid',
          cards: [
            {
              title: 'Card',
              body: [],
              ctas: [{ label: null, href: ' ', style: null }],
              config: { limit: null, minRole: null, emptyLabel: null },
            },
          ],
        },
      ],
    };

    const parsed = PageDocumentSchema.parse(doc);

    const ctaListBlock = parsed.layout[1] as any;
    expect(ctaListBlock.items[0].cta).toBeUndefined();
    expect(ctaListBlock.items[1].cta).toEqual({
      label: 'Learn more',
      href: '/about',
      style: 'primary',
    });

    const cardBlock = parsed.layout[2] as any;
    expect(cardBlock.cards[0].ctas).toBeUndefined();
    expect(cardBlock.cards[0].config).toBeUndefined();
  });

  it('filters invalid image carousel slides and trims fields', () => {
    const doc = {
      id: '2',
      title: 'Gallery',
      path: '/gallery',
      layout: [
        { blockType: 'hero', title: 'Hero', body: [] },
        {
          blockType: 'imageCarousel',
          slides: [
            {
              label: '  Launch bay  ',
              imageUrl: ' https://cdn.example.com/launch.jpg ',
              imageAlt: '  Crew at launch bay ',
              caption: '  Liftoff prep ',
              creditLabel: '  Astral Archives ',
              creditUrl: ' https://astralpirates.com ',
            },
            {
              label: 'Missing URL',
              imageUrl: '',
              imageAlt: 'This slide should be dropped',
            },
          ],
        },
      ],
    };

    const parsed = PageDocumentSchema.parse(doc);
    const carousel = parsed.layout[1] as any;
    expect(carousel.slides).toHaveLength(1);
    expect(carousel.slides[0]).toMatchObject({
      label: 'Launch bay',
      imageUrl: 'https://cdn.example.com/launch.jpg',
      imageAlt: 'Crew at launch bay',
      caption: 'Liftoff prep',
      creditLabel: 'Astral Archives',
      creditUrl: 'https://astralpirates.com/',
    });
  });

  it('hydrates image carousel upload relations into imageUrl', () => {
    const doc = {
      id: '3',
      title: 'Gallery Uploads',
      path: '/gallery-uploads',
      layout: [
        { blockType: 'hero', title: 'Hero', body: [] },
        {
          blockType: 'imageCarousel',
          slides: [
            {
              imageType: 'upload',
              imageAlt: 'Docking ring',
              galleryImage: {
                id: 77,
                filename: 'dock.webp',
                sizes: {
                  preview: {
                    url: '/media/gallery/dock-preview.webp',
                  },
                },
              },
            },
          ],
        },
      ],
    };

    const parsed = PageDocumentSchema.parse(doc);
    const carousel = parsed.layout[1] as any;
    expect(carousel.slides).toHaveLength(1);
    expect(carousel.slides[0]).toMatchObject({
      imageUrl: '/api/gallery-images/file/dock.webp',
      imageAlt: 'Docking ring',
    });
  });

  it('infers image carousel mediaType from URL extension', () => {
    const doc = {
      id: '4',
      title: 'Media carousel',
      path: '/media-carousel',
      layout: [
        { blockType: 'hero', title: 'Hero', body: [] },
        {
          blockType: 'imageCarousel',
          slides: [
            {
              imageType: 'url',
              imageAlt: 'Briefing video',
              imageUrl: 'https://cdn.example.com/briefing.mp4',
            },
          ],
        },
      ],
    };

    const parsed = PageDocumentSchema.parse(doc);
    const carousel = parsed.layout[1] as any;
    expect(carousel.slides[0]?.mediaType).toBe('video');
  });

  it('infers audio carousel mediaType from URL extension', () => {
    const doc = {
      id: '5',
      title: 'Audio carousel',
      path: '/audio-carousel',
      layout: [
        { blockType: 'hero', title: 'Hero', body: [] },
        {
          blockType: 'imageCarousel',
          slides: [
            {
              imageType: 'url',
              imageAlt: 'Mission briefing',
              imageUrl: 'https://cdn.example.com/briefing.mp3',
            },
          ],
        },
      ],
    };

    const parsed = PageDocumentSchema.parse(doc);
    const carousel = parsed.layout[1] as any;
    expect(carousel.slides[0]?.mediaType).toBe('audio');
  });
});
