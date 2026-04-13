import { lexicalEditor } from '@payloadcms/richtext-lexical';
import type { CollectionConfig } from 'payload';
import {
  nullableTextValue,
  PLAN_CLOUD_STATUS_OPTIONS,
  PLAN_STATUS_OPTIONS,
  PLAN_TIER_OPTIONS,
  trimTextValue,
} from './planningMetadata';

const normalisePlanData = <T extends Record<string, any> | undefined>(
  data: T,
  options: {
    operation?: 'create' | 'update';
    originalDoc?: Record<string, any> | null;
  } = {},
) => {
  if (!data) return data;
  const next = { ...data };
  const source = {
    ...((options.operation === 'update' ? options.originalDoc : null) ?? {}),
    ...next,
  };
  next.planId =
    trimTextValue(source.planId) || trimTextValue(source.slug) || trimTextValue(source.title);
  next.slug = trimTextValue(source.slug) || next.planId;
  next.title = trimTextValue(source.title);
  next.owner = nullableTextValue(source.owner);
  next.tier = trimTextValue(source.tier) || 'tier2';
  next.status = trimTextValue(source.status) || 'queued';
  next.cloudStatus = trimTextValue(source.cloudStatus) || 'pending';
  next.summary = nullableTextValue(source.summary);
  next.lastUpdated = nullableTextValue(source.lastUpdated);
  next.path = nullableTextValue(source.path);

  if (Array.isArray(source.links)) {
    next.links = source.links
      .map((link: Record<string, any>) => {
        const url = trimTextValue(link.url);
        if (!url) return null;
        return {
          label: nullableTextValue(link.label) ?? url,
          url,
        };
      })
      .filter(Boolean);
  }

  return next;
};

const Plans: CollectionConfig = {
  slug: 'plans',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['planId', 'title', 'tier', 'status', 'updatedAt'],
    group: 'Content',
  },
  access: {
    read: ({ req }) => Boolean(req.user),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  hooks: {
    beforeValidate: [
      ({ data, operation, originalDoc }) =>
        normalisePlanData(data, {
          operation: operation === 'create' ? 'create' : 'update',
          originalDoc: (originalDoc as Record<string, any> | undefined) ?? null,
        }),
    ],
  },
  fields: [
    {
      name: 'planId',
      label: 'Plan id',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Stable identifier such as plan-archive-cms or T2.20-plan-archive.',
      },
    },
    {
      name: 'slug',
      label: 'Slug',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Used for detail page URLs, typically matches plan id.',
      },
    },
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
    },
    {
      name: 'owner',
      label: 'Owner',
      type: 'text',
      required: true,
    },
    {
      name: 'tier',
      label: 'Tier',
      type: 'select',
      required: true,
      defaultValue: 'tier2',
      options: PLAN_TIER_OPTIONS,
    },
    {
      name: 'status',
      label: 'Status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: PLAN_STATUS_OPTIONS,
    },
    {
      name: 'cloudStatus',
      label: 'Cloud status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: PLAN_CLOUD_STATUS_OPTIONS,
    },
    {
      name: 'summary',
      label: 'Summary',
      type: 'textarea',
      required: false,
    },
    {
      name: 'lastUpdated',
      label: 'Last updated (label)',
      type: 'text',
      required: false,
      admin: {
        description: 'String such as 2025-12-05; keep in sync with roadmap doc.',
      },
    },
    {
      name: 'path',
      label: 'Reference path or URL',
      type: 'text',
      required: false,
      admin: {
        description: 'Relative repo path (docs/...) or external URL for the plan document.',
      },
    },
    {
      name: 'links',
      label: 'Reference links',
      type: 'array',
      required: false,
      fields: [
        {
          name: 'label',
          label: 'Label',
          type: 'text',
          required: false,
        },
        {
          name: 'url',
          label: 'URL',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'body',
      label: 'Body',
      type: 'richText',
      required: false,
      editor: lexicalEditor(),
    },
  ],
};

export default Plans;
