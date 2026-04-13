import type { CollectionConfig } from 'payload';

type IdLike = number | string | { id?: IdLike } | null | undefined;

const normaliseId = (value: IdLike): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === 'object' && 'id' in value) {
    return normaliseId((value as { id?: IdLike }).id);
  }
  return null;
};

const buildRecordKey = (userId: number, flightPlanId: number) =>
  `${userId}:${flightPlanId}`;

const ensureRecordKey = ({ data, originalDoc }: { data?: Record<string, unknown>; originalDoc?: Record<string, unknown> }) => {
  if (!data) return data;
  const userId = normaliseId((data.user as IdLike) ?? (originalDoc?.user as IdLike));
  const flightPlanId = normaliseId(
    (data.flightPlan as IdLike) ?? (originalDoc?.flightPlan as IdLike),
  );
  if (userId == null || flightPlanId == null) return data;
  return {
    ...data,
    recordKey: buildRecordKey(userId, flightPlanId),
  };
};

const MatrixFlightPlanMutes: CollectionConfig = {
  slug: 'matrix-flight-plan-mutes',
  admin: {
    useAsTitle: 'recordKey',
    defaultColumns: ['user', 'flightPlan', 'muted', 'mutedAt'],
  },
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'recordKey',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'flightPlan',
      type: 'relationship',
      relationTo: 'flight-plans',
      required: true,
      index: true,
    },
    {
      name: 'muted',
      type: 'checkbox',
      required: true,
      defaultValue: true,
    },
    {
      name: 'mutedAt',
      type: 'date',
      required: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
  ],
  hooks: {
    beforeValidate: [ensureRecordKey],
  },
};

export default MatrixFlightPlanMutes;
