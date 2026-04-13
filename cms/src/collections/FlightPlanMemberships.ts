import type { CollectionConfig } from 'payload';

export const FLIGHT_PLAN_ROLES = ['owner', 'crew', 'guest'] as const;
export type FlightPlanRole = (typeof FLIGHT_PLAN_ROLES)[number];

export const FLIGHT_PLAN_INVITATION_STATUSES = ['pending', 'accepted', 'declined', 'revoked'] as const;
export type FlightPlanInvitationStatus = (typeof FLIGHT_PLAN_INVITATION_STATUSES)[number];

const FlightPlanMemberships: CollectionConfig = {
  slug: 'flight-plan-memberships',
  admin: {
    useAsTitle: 'flightPlan',
    enableRichTextRelationship: false,
    defaultColumns: ['flightPlan', 'user', 'role', 'invitationStatus', 'invitedAt'],
    pagination: {
      defaultLimit: 50,
    },
  },
  defaultSort: '-createdAt',
  timestamps: true,
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
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      index: true,
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'guest',
      options: FLIGHT_PLAN_ROLES.map((role) => ({
        label: role,
        value: role,
      })),
    },
    {
      name: 'invitationStatus',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: FLIGHT_PLAN_INVITATION_STATUSES.map((status) => ({
        label: status,
        value: status,
      })),
      admin: {
        description: 'Current state of the invitation.',
      },
    },
    {
      name: 'invitedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
    },
    {
      name: 'invitedAt',
      type: 'date',
      required: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'respondedAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
  ],
};

export default FlightPlanMemberships;
