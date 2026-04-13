import type { CollectionConfig } from 'payload';
import { buildAccessPolicyField } from '../fields/accessPolicy';
import {
  nullableTextValue,
  PLAN_CLOUD_STATUS_OPTIONS,
  PLAN_STATUS_OPTIONS,
  ROADMAP_TIER_OPTIONS,
  trimTextValue,
} from './planningMetadata';

const normaliseRoadmapData = <T extends Record<string, any> | undefined>(
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
  next.tierId =
    trimTextValue(source.tierId) || trimTextValue(source.tier) || trimTextValue(source.title);
  next.tier = trimTextValue(source.tier) || next.tierId;
  next.title = trimTextValue(source.title);
  next.description = nullableTextValue(source.description);
  next.focus = nullableTextValue(source.focus);
  next.statusSummary = nullableTextValue(source.statusSummary);

  if (Array.isArray(source.items)) {
    next.items = source.items.map((item: Record<string, any>) => {
      const resolved = { ...item };
      resolved.code = trimTextValue(resolved.code) || trimTextValue(resolved.title);
      resolved.title = trimTextValue(resolved.title);
      resolved.summary = nullableTextValue(resolved.summary);
      resolved.status = trimTextValue(resolved.status) || 'queued';
      resolved.cloudStatus = trimTextValue(resolved.cloudStatus) || 'pending';
      resolved.referenceLabel = nullableTextValue(resolved.referenceLabel);
      resolved.referenceUrl = nullableTextValue(resolved.referenceUrl);
      if (resolved.plan) {
        resolved.plan = {
          ...resolved.plan,
          id: nullableTextValue(resolved.plan.id),
          title: nullableTextValue(resolved.plan.title),
          owner: nullableTextValue(resolved.plan.owner),
          path: nullableTextValue(resolved.plan.path),
          status: nullableTextValue(resolved.plan.status),
          cloudStatus: nullableTextValue(resolved.plan.cloudStatus),
        };
      }
      return resolved;
    });
  }

  return next;
};

const RoadmapTiers: CollectionConfig = {
  slug: 'roadmap-tiers',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['tierId', 'title', 'tier', 'updatedAt'],
    group: 'Content',
  },
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  hooks: {
    beforeValidate: [
      ({ data, operation, originalDoc }) =>
        normaliseRoadmapData(data, {
          operation: operation === 'create' ? 'create' : 'update',
          originalDoc: (originalDoc as Record<string, any> | undefined) ?? null,
        }),
    ],
  },
  fields: [
    {
      name: 'tierId',
      label: 'Tier code',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Stable identifier such as tier1, tier2, tier3, tier4, or tier5.',
      },
    },
    {
      name: 'tier',
      label: 'Tier',
      type: 'select',
      required: true,
      options: ROADMAP_TIER_OPTIONS,
    },
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      label: 'Description',
      type: 'textarea',
      required: false,
    },
    buildAccessPolicyField({
      defaultRoleSpace: 'crew',
      roleSpaceOptions: ['crew'],
      hideRoleSpace: true,
      description:
        'Tier-level read access. Items inherit this policy unless they define an override.',
    }),
    {
      name: 'focus',
      label: 'Focus',
      type: 'text',
      required: false,
      admin: {
        description: 'Optional short focus statement for the tier.',
      },
    },
    {
      name: 'statusSummary',
      label: 'Status summary',
      type: 'text',
      required: false,
      admin: {
        description: 'Optional summary such as “✅ 3 shipped • ⚙️ 1 active • 🧭 2 queued”.',
      },
    },
    {
      name: 'items',
      label: 'Roadmap items',
      type: 'array',
      required: true,
      minRows: 0,
      fields: [
        {
          name: 'code',
          label: 'Code',
          type: 'text',
          required: true,
          admin: {
            description: 'Identifier such as T2.06. Shown on Control and used for ordering.',
          },
        },
        {
          name: 'title',
          label: 'Title',
          type: 'text',
          required: true,
        },
        {
          name: 'summary',
          label: 'Summary',
          type: 'textarea',
          required: false,
        },
        buildAccessPolicyField({
          defaultRoleSpace: 'crew',
          roleSpaceOptions: ['crew'],
          hideRoleSpace: true,
          description: 'Optional item override. If empty, inherits tier-level policy.',
        }),
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
          name: 'referenceLabel',
          label: 'Reference label',
          type: 'text',
          required: false,
          admin: {
            description: 'Optional label for a supporting doc or link.',
          },
        },
        {
          name: 'referenceUrl',
          label: 'Reference URL',
          type: 'text',
          required: false,
          admin: {
            description: 'Doc or plan URL (accepts relative repo paths).',
          },
        },
        {
          name: 'plan',
          label: 'Plan metadata',
          type: 'group',
          required: false,
          admin: {
            description: 'Optional link back to the plan document.',
          },
          fields: [
            {
              name: 'id',
              label: 'Plan id',
              type: 'text',
              required: false,
            },
            {
              name: 'title',
              label: 'Plan title',
              type: 'text',
              required: false,
            },
            {
              name: 'owner',
              label: 'Owner',
              type: 'text',
              required: false,
            },
            {
              name: 'path',
              label: 'Plan path or URL',
              type: 'text',
              required: false,
              admin: {
                description: 'Relative repo path (docs/...) or full URL.',
              },
            },
            {
              name: 'status',
              label: 'Plan status',
              type: 'select',
              required: false,
              options: PLAN_STATUS_OPTIONS,
            },
            {
              name: 'cloudStatus',
              label: 'Plan cloud status',
              type: 'select',
              required: false,
              options: PLAN_CLOUD_STATUS_OPTIONS,
            },
          ],
        },
      ],
    },
  ],
};

export default RoadmapTiers;
