import type { CollectionConfig } from 'payload';

export const NAVIGATION_NODE_IDS = [
  'arch',
  'flight',
  'bridge',
  'log',
  'gangway',
  'airlock',
  'about',
  'pirates',
  'legal',
  'contact',
  'crew',
  'lair',
  'engineering',
  'control',
  'bay',
] as const;

export const NAVIGATION_NODE_OPTIONS = NAVIGATION_NODE_IDS.map((id) => ({
  label: id,
  value: id,
}));

const NavigationNodes: CollectionConfig = {
  slug: 'navigation-nodes',
  access: {
    read: () => true,
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  admin: {
    useAsTitle: 'label',
    group: 'Content',
  },
  fields: [
    {
      name: 'nodeId',
      label: 'Node',
      type: 'select',
      required: true,
      unique: true,
      options: NAVIGATION_NODE_OPTIONS,
    },
    {
      name: 'label',
      type: 'text',
      required: true,
      admin: {
        description: 'Override label displayed in navigation and menu.',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: false,
      admin: {
        description: 'Optional tooltip/description for this node.',
      },
    },
    {
      name: 'sourcePath',
      type: 'text',
      required: false,
      admin: {
        position: 'sidebar',
        description: 'Automatically managed path of the linked page (if any).',
        readOnly: true,
      },
    },
  ],
};

export default NavigationNodes;
