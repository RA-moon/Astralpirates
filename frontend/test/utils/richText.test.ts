import { describe, it, expect } from 'vitest';

import { renderRichText } from '~/utils/richText';
import type { RichTextContent } from '~/modules/api/schemas';

describe('renderRichText', () => {
  it('renders column layouts with headings and lists', () => {
    const content: RichTextContent = [
      {
        type: 'columns',
        children: [
          {
            type: 'column',
            children: [
              { type: 'h4', children: [{ text: 'Column one' }] },
              {
                type: 'ul',
                children: [
                  {
                    type: 'li',
                    children: [{ text: 'Item A' }],
                  },
                ],
              },
            ],
          },
          {
            type: 'column',
            children: [
              { type: 'h4', children: [{ text: 'Column two' }] },
              {
                type: 'ul',
                children: [
                  {
                    type: 'li',
                    children: [{ text: 'Item B' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const html = renderRichText(content);

    expect(html).toContain('class="rich-text__columns"');
    expect(html).toContain('<h4>Column one</h4>');
    expect(html).toContain('<li>Item B</li>');
  });

  it('rewrites legacy relative flight-plan links to the canonical bridge path', () => {
    const content: RichTextContent = [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: '/flight-plans/events/flying-concrete-table',
            children: [{ text: 'Next flight plan' }],
          },
        ],
      },
    ];

    const html = renderRichText(content);

    expect(html).toContain('href="/bridge/flight-plans/flying-concrete-table"');
  });

  it('rewrites absolute astralpirates links that point at legacy flight-plan URLs', () => {
    const content: RichTextContent = [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url: 'https://astralpirates.com/flight-plans/events/flying-concrete-table?ref=cta',
            children: [{ text: 'Levitation mission' }],
          },
        ],
      },
    ];

    const html = renderRichText(content);

    expect(html).toContain(
      'href="https://astralpirates.com/bridge/flight-plans/flying-concrete-table?ref=cta"',
    );
  });
});
