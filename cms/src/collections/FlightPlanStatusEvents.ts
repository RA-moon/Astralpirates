import type { CollectionConfig } from 'payload';

const FlightPlanStatusEvents: CollectionConfig = {
  slug: 'flight-plan-status-events',
  admin: {
    useAsTitle: 'actionType',
    enableRichTextRelationship: false,
    defaultColumns: ['actionType', 'flightPlan', 'fromStatus', 'toStatus', 'changedBy', 'changedAt'],
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
      name: 'flightPlan',
      type: 'relationship',
      relationTo: 'flight-plans',
      required: true,
      index: true,
    },
    {
      name: 'fromStatus',
      type: 'select',
      required: false,
      options: [
        { label: 'Planned', value: 'planned' },
        { label: 'Pending', value: 'pending' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'On Hold', value: 'on-hold' },
        { label: 'Postponed', value: 'postponed' },
        { label: 'Success', value: 'success' },
        { label: 'Failure', value: 'failure' },
        { label: 'Aborted', value: 'aborted' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      index: true,
    },
    {
      name: 'toStatus',
      type: 'select',
      required: true,
      options: [
        { label: 'Planned', value: 'planned' },
        { label: 'Pending', value: 'pending' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'On Hold', value: 'on-hold' },
        { label: 'Postponed', value: 'postponed' },
        { label: 'Success', value: 'success' },
        { label: 'Failure', value: 'failure' },
        { label: 'Aborted', value: 'aborted' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      index: true,
    },
    {
      name: 'reason',
      type: 'textarea',
      maxLength: 500,
    },
    {
      name: 'changedBy',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      index: true,
    },
    {
      name: 'changedAt',
      type: 'date',
      required: true,
      index: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'actionType',
      type: 'select',
      required: true,
      options: [
        { label: 'Transition', value: 'transition' },
        { label: 'Reopen', value: 'reopen' },
        { label: 'Normalize', value: 'normalize' },
        { label: 'Backfill', value: 'backfill' },
      ],
      index: true,
    },
  ],
};

export default FlightPlanStatusEvents;
