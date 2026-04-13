import type { CollectionConfig } from 'payload';

const FlightPlanMembershipEvents: CollectionConfig = {
  slug: 'flight-plan-membership-events',
  admin: {
    useAsTitle: 'eventType',
    enableRichTextRelationship: false,
    defaultColumns: ['eventType', 'flightPlan', 'user', 'queuedAt', 'processedAt'],
    pagination: {
      defaultLimit: 50,
    },
  },
  timestamps: false,
  access: {
    read: () => false,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'membership',
      type: 'relationship',
      relationTo: 'flight-plan-memberships',
      required: false,
    },
    {
      name: 'flightPlan',
      type: 'relationship',
      relationTo: 'flight-plans',
      required: true,
      index: true,
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'eventType',
      type: 'text',
      required: true,
    },
    {
      name: 'payload',
      type: 'json',
      required: true,
    },
    {
      name: 'attempts',
      type: 'number',
      required: true,
      defaultValue: 0,
    },
    {
      name: 'lastError',
      type: 'textarea',
    },
    {
      name: 'queuedAt',
      type: 'date',
      required: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'lockedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'processedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
  ],
};

export default FlightPlanMembershipEvents;
