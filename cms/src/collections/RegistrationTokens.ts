import type { CollectionConfig } from 'payload';

const RegistrationTokens: CollectionConfig = {
  slug: 'registration-tokens',
  admin: {
    hidden: true,
    useAsTitle: 'email',
  },
  access: {
    read: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'email',
      type: 'email',
      required: true,
    },
    {
      name: 'firstName',
      label: 'First name',
      type: 'text',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'lastName',
      label: 'Surname',
      type: 'text',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'purpose',
      label: 'Purpose',
      type: 'select',
      required: true,
      defaultValue: 'recruit',
      options: [
        { label: 'Recruit', value: 'recruit' },
        { label: 'Password reset', value: 'password_reset' },
      ],
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'targetUser',
      label: 'Target account',
      type: 'relationship',
      relationTo: 'users',
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        position: 'sidebar',
        description: 'Account this token acts on (password resets only).',
        readOnly: true,
      },
    },
    {
      name: 'inviter',
      label: 'Invited by',
      type: 'relationship',
      relationTo: 'users',
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        position: 'sidebar',
        description: 'Crew member who issued this invite token.',
        readOnly: true,
      },
    },
    {
      name: 'token',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'expiresAt',
      type: 'date',
      required: true,
    },
    {
      name: 'used',
      type: 'checkbox',
      defaultValue: false,
    },
  ],
};

export default RegistrationTokens;
