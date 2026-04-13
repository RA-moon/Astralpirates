import type { CollectionConfig } from 'payload';

const InviteRequests: CollectionConfig = {
  slug: 'invite-requests',
  admin: {
    hidden: true,
    useAsTitle: 'ip',
  },
  access: {
    read: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'ip',
      type: 'text',
      required: true,
    },
    {
      name: 'userAgent',
      type: 'text',
    },
    {
      name: 'email',
      type: 'email',
    },
  ],
};

export default InviteRequests;
