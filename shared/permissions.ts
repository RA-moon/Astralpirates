import type { CrewRole } from './crewRoles';

export type PermissionKey = 'managePages' | 'manageLogs' | 'createFlightPlans';

export type PermissionRule = {
  key: PermissionKey;
  label: string;
  description: string;
  minRole: CrewRole;
};

const createRule = <K extends PermissionKey>(key: K, config: Omit<PermissionRule, 'key'>) =>
  Object.freeze({
    key,
    ...config,
  });

export const PERMISSIONS: Readonly<Record<PermissionKey, PermissionRule>> = Object.freeze({
  managePages: createRule('managePages', {
    label: 'Manage pages',
    description: 'Create, edit, and delete structured site pages.',
    minRole: 'captain',
  }),
  manageLogs: createRule('manageLogs', {
    label: 'Manage logs',
    description: 'Edit or delete logbook entries from the CMS.',
    minRole: 'captain',
  }),
  createFlightPlans: createRule('createFlightPlans', {
    label: 'Create flight plans',
    description: 'Publish new missions on the bridge.',
    minRole: 'seamen',
  }),
});

export const resolvePermissionRule = (key: PermissionKey): PermissionRule => {
  const rule = PERMISSIONS[key];
  if (!rule) {
    throw new Error(`Unknown permission key: ${key}`);
  }
  return rule;
};

export const getPermissionMinRole = (key: PermissionKey): CrewRole =>
  resolvePermissionRule(key).minRole;
