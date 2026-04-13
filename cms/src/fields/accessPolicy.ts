import type { Field, FieldHook } from 'payload';

import {
  FLIGHT_PLAN_ACCESS_ROLES,
  normalizeAccessPolicy,
  type AccessRoleSpace,
} from '@astralpirates/shared/accessPolicy';
import { CREW_ROLE_LABELS, CREW_ROLE_OPTIONS, type CrewRole } from '@astralpirates/shared/crewRoles';

type AccessPolicyFieldOptions = {
  name?: string;
  label?: string;
  description?: string;
  defaultRoleSpace?: AccessRoleSpace;
  roleSpaceOptions?: AccessRoleSpace[];
  hideRoleSpace?: boolean;
};

const ACCESS_POLICY_MODE_OPTIONS = [
  { label: 'Public (anyone can read)', value: 'public' },
  { label: 'Role based', value: 'role' },
  { label: 'Private (owner only)', value: 'private' },
];

const FLIGHT_PLAN_ROLE_LABELS: Readonly<Record<(typeof FLIGHT_PLAN_ACCESS_ROLES)[number], string>> =
  Object.freeze({
    captain: 'Captain',
    crew: 'Crew',
    passenger: 'Passenger',
  });

const createRoleOptions = (roleSpaceOptions: AccessRoleSpace[]) => {
  const options = new Map<string, string>();

  if (roleSpaceOptions.includes('crew')) {
    for (const entry of CREW_ROLE_OPTIONS) {
      const label = CREW_ROLE_LABELS[entry.value as CrewRole] ?? entry.label;
      options.set(entry.value, `Crew · ${label}`);
    }
  }

  if (roleSpaceOptions.includes('flight-plan')) {
    for (const role of FLIGHT_PLAN_ACCESS_ROLES) {
      if (!options.has(role)) {
        options.set(role, `Flight plan · ${FLIGHT_PLAN_ROLE_LABELS[role]}`);
      }
    }
  }

  return Array.from(options.entries()).map(([value, label]) => ({ value, label }));
};

const normaliseAccessPolicyValue = (defaultRoleSpace: AccessRoleSpace): FieldHook =>
  ({ value }) => {
    const normalized = normalizeAccessPolicy(value as any, { defaultRoleSpace });
    return normalized ?? undefined;
  };

export const buildAccessPolicyField = ({
  name = 'accessPolicy',
  label = 'Read access policy',
  description,
  defaultRoleSpace = 'crew',
  roleSpaceOptions = ['crew', 'flight-plan'],
  hideRoleSpace = false,
}: AccessPolicyFieldOptions = {}): Field => {
  const roleOptions = createRoleOptions(roleSpaceOptions);

  return {
    name,
    label,
    type: 'group',
    required: false,
    admin: {
      description:
        description ??
        'Define who can read this content. If not set, parent/domain defaults apply.',
    },
    hooks: {
      beforeValidate: [normaliseAccessPolicyValue(defaultRoleSpace)],
    },
    fields: [
      {
        name: 'mode',
        label: 'Mode',
        type: 'select',
        required: false,
        options: ACCESS_POLICY_MODE_OPTIONS,
      },
      {
        name: 'roleSpace',
        label: 'Role set',
        type: 'select',
        required: false,
        defaultValue: defaultRoleSpace,
        admin: {
          hidden: hideRoleSpace || roleSpaceOptions.length <= 1,
          condition: (_data, siblingData) => siblingData?.mode === 'role',
        },
        options: roleSpaceOptions.map((value) => ({
          value,
          label: value === 'flight-plan' ? 'Flight plan roles' : 'Crew roles',
        })),
      },
      {
        name: 'minimumRole',
        label: 'Minimum role',
        type: 'select',
        required: false,
        admin: {
          condition: (_data, siblingData) => siblingData?.mode === 'role',
          description: 'Examples: Crew · Cook or Flight plan · Passenger.',
        },
        options: roleOptions,
      },
    ],
  };
};
