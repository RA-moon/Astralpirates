import type { Block, Field, FieldHook } from 'payload';

import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { CREW_ROLE_OPTIONS } from '@astralpirates/shared/crewRoles';
import { NAVIGATION_NODE_OPTIONS } from '../collections/NavigationNodes';
import { buildGallerySlidesField } from './gallerySlides';
import { buildAccessPolicyField } from './accessPolicy';

const CTA_STYLE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: 'Primary', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
  { label: 'Link', value: 'link' },
];

const defaultEditor = lexicalEditor();

const createBlockAccessPolicyField = (): Field =>
  buildAccessPolicyField({
    description: 'Optional override. Leave unset to inherit the page access policy.',
    defaultRoleSpace: 'crew',
    roleSpaceOptions: ['crew'],
    hideRoleSpace: true,
  });

const richTextField = (name: string, label: string, required = false): Field => ({
  name,
  label,
  type: 'richText',
  required,
  editor: defaultEditor,
});

const linkFields: Field[] = [
  {
    name: 'label',
    label: 'Label',
    type: 'text',
    required: true,
  },
  {
    name: 'href',
    label: 'URL',
    type: 'text',
    required: true,
  },
  {
    name: 'style',
    label: 'Style',
    type: 'select',
    required: false,
    defaultValue: 'primary',
    options: CTA_STYLE_OPTIONS,
  },
];

const optionalLinkFields: Field[] = linkFields.map((field) => {
  const next: Field = { ...field };
  if ('required' in next) {
    next.required = false;
  }
  if ('defaultValue' in next) {
    delete (next as { defaultValue?: unknown }).defaultValue;
  }
  return next;
});

const normaliseOptionalLink: FieldHook = ({ value }) => {
  if (!value) return undefined;
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  const href = typeof value.href === 'string' ? value.href.trim() : '';
  if (!label || !href) return undefined;
  return {
    label,
    href,
    style:
      typeof value.style === 'string' && ['primary', 'secondary', 'link'].includes(value.style)
        ? value.style
        : 'primary',
  };
};

const normaliseCardConfig: FieldHook = ({ value }) => {
  if (!value || typeof value !== 'object') return undefined;
  const { limit, minRole, emptyLabel } = value as Record<string, unknown>;
  const config: Record<string, unknown> = {};
  if (typeof limit === 'number') config.limit = limit;
  if (typeof minRole === 'string' && minRole.trim().length > 0) config.minRole = minRole;
  if (typeof emptyLabel === 'string' && emptyLabel.trim().length > 0) config.emptyLabel = emptyLabel;
  return Object.keys(config).length > 0 ? config : undefined;
};

export const HeroBlock: Block = {
  slug: 'hero',
  labels: {
    singular: 'Hero section',
    plural: 'Hero sections',
  },
  fields: [
    createBlockAccessPolicyField(),
    {
      name: 'eyebrow',
      label: 'Eyebrow',
      type: 'text',
      required: false,
    },
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
    },
    richTextField('tagline', 'Tagline'),
    richTextField('body', 'Body'),
    {
      name: 'ctas',
      label: 'Calls to action',
      type: 'array',
      required: false,
      maxRows: 3,
      fields: linkFields,
    },
  ],
};

export const CardGridBlock: Block = {
  slug: 'cardGrid',
  labels: {
    singular: 'Card grid',
    plural: 'Card grids',
  },
  fields: [
    createBlockAccessPolicyField(),
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: false,
    },
    richTextField('intro', 'Introduction'),
    {
      name: 'columns',
      label: 'Columns',
      type: 'select',
      required: false,
      defaultValue: 'three',
      options: [
        { label: 'Stacked', value: 'one' },
        { label: 'Two', value: 'two' },
        { label: 'Three', value: 'three' },
      ],
    },
    {
      name: 'cards',
      label: 'Cards',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'variant',
          label: 'Variant',
          type: 'select',
          required: false,
          defaultValue: 'static',
          options: [
            { label: 'Static content', value: 'static' },
            { label: 'Flight plans', value: 'flightPlans' },
            { label: 'Logs', value: 'logs' },
            { label: 'Links', value: 'links' },
          ],
        },
        {
          name: 'badge',
          label: 'Badge',
          type: 'text',
          required: false,
        },
        {
          name: 'title',
          label: 'Title',
          type: 'text',
          required: true,
        },
        richTextField('body', 'Body'),
        {
          name: 'ctas',
          label: 'Calls to action',
          type: 'array',
          required: false,
          maxRows: 3,
          fields: linkFields,
        },
        {
          name: 'config',
          label: 'Dynamic config',
          type: 'group',
          required: false,
          admin: {
            description: 'Optional settings for dynamic cards (variant dependent).',
          },
          hooks: {
            beforeValidate: [normaliseCardConfig],
          },
          fields: [
            {
              name: 'limit',
              label: 'Limit',
              type: 'number',
              required: false,
              min: 1,
              max: 12,
            },
            {
              name: 'minRole',
              label: 'Minimum role',
              type: 'select',
              required: false,
              options: CREW_ROLE_OPTIONS.map((option) => ({
                label: option.label,
                value: option.value,
              })),
            },
            {
              name: 'emptyLabel',
              label: 'Empty state label',
              type: 'text',
              required: false,
            },
          ],
        },
      ],
    },
  ],
};

export const TimelineBlock: Block = {
  slug: 'timeline',
  labels: {
    singular: 'Timeline',
    plural: 'Timelines',
  },
  fields: [
    createBlockAccessPolicyField(),
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: false,
    },
    richTextField('intro', 'Introduction'),
    {
      name: 'items',
      label: 'Timeline items',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'heading',
          label: 'Heading',
          type: 'text',
          required: true,
        },
        {
          name: 'timestamp',
          label: 'Timestamp',
          type: 'text',
          required: false,
        },
        richTextField('body', 'Body'),
      ],
    },
  ],
};

export const ImageCarouselBlock: Block = {
  slug: 'imageCarousel',
  labels: {
    singular: 'Image carousel',
    plural: 'Image carousels',
  },
  fields: [
    createBlockAccessPolicyField(),
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: false,
    },
    richTextField('intro', 'Introduction'),
    buildGallerySlidesField({
      name: 'slides',
      label: 'Slides',
      required: true,
      minRows: 1,
      maxRows: 8,
      description: 'Provide at least one media item with descriptive alt text.',
      defaultImageType: 'upload',
      defaultMediaType: 'image',
      descriptionFieldName: 'caption',
    }),
  ],
};

export const CTAListBlock: Block = {
  slug: 'ctaList',
  labels: {
    singular: 'CTA list',
    plural: 'CTA lists',
  },
  fields: [
    createBlockAccessPolicyField(),
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: false,
    },
    richTextField('intro', 'Introduction'),
    {
      name: 'items',
      label: 'Items',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'title',
          label: 'Title',
          type: 'text',
          required: true,
        },
        richTextField('description', 'Description'),
        {
          name: 'cta',
          label: 'Link',
          type: 'group',
          required: false,
          hooks: {
            beforeValidate: [normaliseOptionalLink],
          },
          fields: optionalLinkFields,
        },
      ],
    },
  ],
};

export const StatGridBlock: Block = {
  slug: 'statGrid',
  labels: {
    singular: 'Stat grid',
    plural: 'Stat grids',
  },
  fields: [
    createBlockAccessPolicyField(),
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: false,
    },
    richTextField('intro', 'Introduction'),
    {
      name: 'stats',
      label: 'Stats',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        {
          name: 'value',
          label: 'Value',
          type: 'text',
          required: true,
        },
        {
          name: 'label',
          label: 'Label',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'ctas',
      label: 'Calls to action',
      type: 'array',
      required: false,
      maxRows: 3,
      fields: linkFields,
    },
  ],
};

export const CrewPreviewBlock: Block = {
  slug: 'crewPreview',
  labels: {
    singular: 'Crew preview',
    plural: 'Crew previews',
  },
  fields: [
    createBlockAccessPolicyField(),
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
    },
    richTextField('description', 'Description'),
    {
      name: 'minRole',
      label: 'Minimum role',
      type: 'select',
      required: false,
      options: CREW_ROLE_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    },
    {
      name: 'limit',
      label: 'Crew limit',
      type: 'number',
      required: false,
      min: 1,
      max: 12,
      defaultValue: 3,
    },
    {
      name: 'cta',
      label: 'Primary link',
      type: 'group',
      required: false,
      hooks: {
        beforeValidate: [normaliseOptionalLink],
      },
      fields: linkFields,
    },
  ],
};

export const CrewRosterBlock: Block = {
  slug: 'crewRoster',
  labels: {
    singular: 'Crew roster',
    plural: 'Crew rosters',
  },
  fields: [
    createBlockAccessPolicyField(),
    {
      name: 'badge',
      label: 'Badge',
      type: 'text',
      required: false,
    },
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
    },
    richTextField('description', 'Description'),
    {
      name: 'mode',
      label: 'Display mode',
      type: 'select',
      required: false,
      defaultValue: 'full',
      options: [
        { label: 'Full roster', value: 'full' },
        { label: 'Preview rail', value: 'preview' },
      ],
    },
    {
      name: 'limit',
      label: 'Crew limit',
      type: 'number',
      required: false,
      min: 1,
      max: 24,
      admin: {
        description: 'Caps the number of crew rendered (affects both modes).',
      },
    },
    {
      name: 'ctas',
      label: 'Calls to action',
      type: 'array',
      required: false,
      maxRows: 3,
      fields: linkFields,
    },
  ],
};

export const NavigationModuleBlock: Block = {
  slug: 'navigationModule',
  labels: {
    singular: 'Navigation module',
    plural: 'Navigation modules',
  },
  fields: [
    createBlockAccessPolicyField(),
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: false,
    },
    richTextField('description', 'Description'),
    {
      name: 'nodeId',
      label: 'Target navigation node',
      type: 'select',
      required: false,
      options: NAVIGATION_NODE_OPTIONS,
      admin: {
        description: 'Optional override; defaults to matching the current page path.',
      },
    },
    {
      name: 'path',
      label: 'Target path override',
      type: 'text',
      required: false,
      admin: {
        description: 'Use when linking from a page that is not part of the ship layout tree.',
      },
    },
  ],
};

export const PAGE_BLOCKS: Block[] = [
  HeroBlock,
  CardGridBlock,
  TimelineBlock,
  ImageCarouselBlock,
  CTAListBlock,
  StatGridBlock,
  CrewPreviewBlock,
  CrewRosterBlock,
  NavigationModuleBlock,
];
