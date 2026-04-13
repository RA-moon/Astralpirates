import type { CollectionConfig } from 'payload';

import { crewCanPerform } from '@/src/access/crew';

const sanitizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const Notifications: CollectionConfig = {
  slug: 'notifications',
  admin: {
    useAsTitle: 'event',
    defaultColumns: ['event', 'recipient', 'createdAt', 'readAt'],
  },
  access: {
    read: crewCanPerform,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'event',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'recipient',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'message',
      type: 'textarea',
      required: true,
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'ctaUrl',
      type: 'text',
      admin: {
        readOnly: true,
      },
      hooks: {
        beforeChange: [
          ({ value }) => sanitizeString(value),
        ],
      },
    },
    {
      name: 'ctaLabel',
      type: 'text',
      admin: {
        readOnly: true,
      },
      hooks: {
        beforeChange: [
          ({ value }) => sanitizeString(value),
        ],
      },
    },
    {
      name: 'metadata',
      type: 'json',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'readAt',
      type: 'date',
    },
  ],
};

export default Notifications;
