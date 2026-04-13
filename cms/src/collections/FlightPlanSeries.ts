import type { CollectionConfig } from 'payload';

const FlightPlanSeries: CollectionConfig = {
  slug: 'flight-plan-series',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'category', 'owner', 'updatedAt'],
    pagination: {
      defaultLimit: 50,
    },
  },
  access: {
    read: () => true,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'title',
      type: 'text',
      required: true,
      index: true,
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      defaultValue: 'project',
      options: [
        { label: 'Project', value: 'project' },
        { label: 'Event', value: 'event' },
        { label: 'Test', value: 'test' },
      ],
      index: true,
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      index: true,
    },
  ],
};

export default FlightPlanSeries;
