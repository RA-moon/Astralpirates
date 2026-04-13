import { render, screen } from '@testing-library/vue';
import { createPinia } from 'pinia';
import { describe, it, expect } from 'vitest';

import PageRenderer from '~/components/PageRenderer.vue';
import type { PageBlock, RichTextContent } from '~/modules/api/schemas';

const paragraph = (text: string): RichTextContent => [
  {
    type: 'paragraph',
    children: [
      {
        text,
      },
    ],
  },
];

describe('PageRenderer', () => {
  it('renders hero and static blocks', async () => {
    const blocks: PageBlock[] = [
      {
        blockType: 'hero',
        title: 'Test Hero',
        eyebrow: 'Eyebrow',
        tagline: paragraph('This is a hero block.'),
        body: paragraph('Additional body copy.'),
        ctas: [{ label: 'Primary CTA', href: '/test', style: 'primary' }],
      },
      {
        blockType: 'cardGrid',
        columns: 'two',
        cards: [
          {
            variant: 'static',
            title: 'Card title',
            badge: 'Badge',
            body: paragraph('Card body'),
            ctas: [{ label: 'Learn more', href: '/more', style: 'secondary' }],
          },
        ],
      },
      {
        blockType: 'ctaList',
        title: 'Call to action list',
        items: [
          {
            title: 'Item one',
            description: paragraph('Item description.'),
          },
        ],
      },
    ];

    render(PageRenderer, {
      props: {
        blocks,
      },
      global: {
        plugins: [createPinia()],
      },
    });

    expect(await screen.findByText('Test Hero')).toBeTruthy();
    expect(screen.getByText('Card title')).toBeTruthy();
    expect(screen.getByText('Call to action list')).toBeTruthy();
  });
});
