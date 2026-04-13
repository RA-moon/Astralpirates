export const CREW_ROLES = [
  'captain',
  'quartermaster',
  'sailing-master',
  'boatswain',
  'gunner',
  'carpenter',
  'surgeon',
  'master-at-arms',
  'cook',
  'seamen',
  'powder-monkey',
  'cabin-boy',
  'swabbie',
] as const;

export type CrewRole = (typeof CREW_ROLES)[number];

export const CREW_ROLE_LABELS: Readonly<Record<CrewRole, string>> = Object.freeze({
  captain: 'Captain',
  quartermaster: 'Quartermaster',
  'sailing-master': 'Sailing Master',
  boatswain: 'Boatswain',
  gunner: 'Gunner',
  carpenter: 'Carpenter',
  surgeon: 'Surgeon',
  'master-at-arms': 'Master-at-Arms',
  cook: 'Cook',
  seamen: 'Seamen',
  'powder-monkey': 'Powder Monkey',
  'cabin-boy': 'Cabin Boy',
  swabbie: 'Swabbie',
});

export const CAPTAIN_ROLE: CrewRole = 'captain';
export const DEFAULT_CREW_ROLE: CrewRole = 'swabbie';
const CAPTAIN_INVITE_ROLE: CrewRole = 'seamen';

const buildRoleIndex = () =>
  CREW_ROLES.reduce((accumulator, role, index) => {
    accumulator[role] = index;
    return accumulator;
  }, Object.create(null) as Record<CrewRole, number>);

export const CREW_ROLE_INDEX = Object.freeze(buildRoleIndex());

export const CREW_ROLE_OPTIONS = Object.freeze(
  CREW_ROLES.map((role) =>
    Object.freeze({
      label: CREW_ROLE_LABELS[role],
      value: role,
    }),
  ),
);

export const CREW_ROLE_SET: ReadonlySet<CrewRole> = new Set(CREW_ROLES);

export const isRoleAtLeast = (role: CrewRole | null | undefined, minimum: CrewRole): boolean => {
  if (!role || !minimum) return false;
  const roleIndex = CREW_ROLE_INDEX[role];
  const minimumIndex = CREW_ROLE_INDEX[minimum];
  if (roleIndex === undefined || minimumIndex === undefined) return false;
  return roleIndex <= minimumIndex;
};

export const resolveInviteeCrewRole = (
  inviterRole: CrewRole | null | undefined,
): CrewRole => (inviterRole === CAPTAIN_ROLE ? CAPTAIN_INVITE_ROLE : DEFAULT_CREW_ROLE);
