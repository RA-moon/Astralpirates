import { type CrewRole } from '@astralpirates/shared/crewRoles';
import { DEFAULT_TEST_RUN_CADENCE, type TestRunCadence } from '../constants/testRunCadences';

export type TestPackElsaRequirement = {
  captain?: number;
  crew?: number;
};

export type TestScenario = {
  slug: string;
  description?: string;
  runCadence?: TestRunCadence;
};

export type TestPack = {
  id: string;
  title?: string;
  summary?: string;
  scenarios: TestScenario[];
  requiredElsa?: TestPackElsaRequirement;
  fixtures?: {
    logSlug?: string;
    logHeadline?: string;
    logBody?: string;
  };
};

const normalizeElsaRequirement = (value?: TestPackElsaRequirement | null): TestPackElsaRequirement => {
  if (!value) {
    return { captain: 0, crew: 0 };
  }
  const normalize = (input?: number) => (typeof input === 'number' && Number.isFinite(input) ? Math.max(0, Math.floor(input)) : undefined);
  return {
    captain: normalize(value.captain),
    crew: normalize(value.crew),
  };
};

const DEFAULT_SCENARIOS: TestScenario[] = [
  {
    slug: 'flightplan/create',
    description: 'Create a new flight plan and verify fields persist after refresh.',
    runCadence: DEFAULT_TEST_RUN_CADENCE,
  },
  {
    slug: 'flightplan/invite',
    description: 'Invite a crew member, accept as invitee, confirm roster updates.',
    runCadence: DEFAULT_TEST_RUN_CADENCE,
  },
  {
    slug: 'log/create',
    description: 'Create a captain log entry and confirm it appears in listings.',
    runCadence: DEFAULT_TEST_RUN_CADENCE,
  },
  {
    slug: 'flightplan-task/selfassign',
    description: 'Create a task, self-assign, and move it through states.',
    runCadence: DEFAULT_TEST_RUN_CADENCE,
  },
];

const CREATION_ELSA_REQUIREMENT: TestPackElsaRequirement = Object.freeze({ captain: 2, crew: 2 });

const TEST_PACKS: Record<string, TestPack> = {
  roles: {
    id: 'roles',
    title: 'Test: roles',
    summary: 'Regression pack for roles',
    scenarios: DEFAULT_SCENARIOS,
    requiredElsa: CREATION_ELSA_REQUIREMENT,
    fixtures: {
      logSlug: 'test-roles-fixture-log',
      logHeadline: 'Fixture log for roles',
      logBody:
        'Deterministic fixture log for the roles pack. Use for read/view flows without manual content.',
    },
  },
  visibility: {
    id: 'visibility',
    title: 'Test: visibility',
    summary: 'Visibility toggles and roster access',
    scenarios: [
      {
        slug: 'flightplan/visibility-toggle',
        description: 'Toggle mission visibility public/private and verify roster access rules.',
        runCadence: DEFAULT_TEST_RUN_CADENCE,
      },
      {
        slug: 'flightplan/roster-view',
        description: 'View roster as guest vs crew; ensure private rosters are protected.',
        runCadence: DEFAULT_TEST_RUN_CADENCE,
      },
      ...DEFAULT_SCENARIOS,
    ],
    requiredElsa: CREATION_ELSA_REQUIREMENT,
    fixtures: {
      logSlug: 'test-visibility-fixture-log',
      logHeadline: 'Fixture log for visibility',
      logBody: 'Use this fixture when validating visibility toggles and roster protections.',
    },
  },
  gallery: {
    id: 'gallery',
    title: 'Test: gallery uploads',
    summary: 'Gallery upload and rendering paths',
    scenarios: [
      {
        slug: 'gallery/upload',
        description: 'Upload gallery media and confirm it renders in mission/gallery cards.',
        runCadence: DEFAULT_TEST_RUN_CADENCE,
      },
      {
        slug: 'gallery/cleanup',
        description: 'Replace and delete media; verify references update and no broken images remain.',
        runCadence: DEFAULT_TEST_RUN_CADENCE,
      },
      ...DEFAULT_SCENARIOS,
    ],
    requiredElsa: CREATION_ELSA_REQUIREMENT,
    fixtures: {
      logSlug: 'test-gallery-fixture-log',
      logHeadline: 'Fixture log for gallery',
      logBody: 'Fixture content for gallery scenarios; attach media during the flow.',
    },
  },
  urls: {
    id: 'urls',
    title: 'Test: URL normalization',
    summary: 'URL normalization and linking flows',
    scenarios: [
      {
        slug: 'links/normalization',
        description: 'Add links with mixed protocols/query params; confirm normalized URLs render and open correctly.',
        runCadence: DEFAULT_TEST_RUN_CADENCE,
      },
      {
        slug: 'links/embed',
        description: 'Embed external links in logs/tasks and verify sanitized output.',
        runCadence: DEFAULT_TEST_RUN_CADENCE,
      },
      ...DEFAULT_SCENARIOS,
    ],
    requiredElsa: CREATION_ELSA_REQUIREMENT,
    fixtures: {
      logSlug: 'test-urls-fixture-log',
      logHeadline: 'Fixture log for URLs',
      logBody: 'Fixture content for URL normalization scenarios.',
    },
  },
  invites: {
    id: 'invites',
    title: 'Test: invites',
    summary: 'Invite creation, throttling, and acceptance',
    scenarios: [
      {
        slug: 'invite/create',
        description: 'Send an invite as captain; validate throttling and email preview.',
        runCadence: DEFAULT_TEST_RUN_CADENCE,
      },
      {
        slug: 'invite/accept',
        description: 'Accept invite as crew; confirm roster role and permissions.',
        runCadence: DEFAULT_TEST_RUN_CADENCE,
      },
      ...DEFAULT_SCENARIOS,
    ],
    requiredElsa: CREATION_ELSA_REQUIREMENT,
    fixtures: {
      logSlug: 'test-invites-fixture-log',
      logHeadline: 'Fixture log for invites',
      logBody: 'Fixture content for invite workflows; pair with roster checks.',
    },
  },
  tasks: {
    id: 'tasks',
    title: 'Test: task board',
    summary: 'Task creation, assignment, and state changes',
    scenarios: [
      {
        slug: 'task/assign',
        description: 'Create mission task, assign to crew, move through states with evidence.',
        runCadence: DEFAULT_TEST_RUN_CADENCE,
      },
      {
        slug: 'task/reopen',
        description: 'Reopen a completed task and ensure state transitions/notifications behave.',
        runCadence: DEFAULT_TEST_RUN_CADENCE,
      },
      ...DEFAULT_SCENARIOS,
    ],
    requiredElsa: CREATION_ELSA_REQUIREMENT,
    fixtures: {
      logSlug: 'test-tasks-fixture-log',
      logHeadline: 'Fixture log for tasks',
      logBody: 'Fixture content for task-board scenarios.',
    },
  },
  messaging: {
    id: 'messaging',
    title: 'Test: crew messaging',
    summary: 'Crew messaging threads, permissions, and encryption guards',
    scenarios: [
      {
        slug: 'messaging/send',
        description: 'Send/receive crew messages between roles; verify visibility and delivery states.',
        runCadence: 'repeat-2',
      },
      {
        slug: 'messaging/permissions',
        description: 'Ensure non-members cannot read threads; check 403s and error copy.',
        runCadence: 'repeat-2',
      },
      ...DEFAULT_SCENARIOS,
    ],
    requiredElsa: CREATION_ELSA_REQUIREMENT,
    fixtures: {
      logSlug: 'test-messaging-fixture-log',
      logHeadline: 'Fixture log for messaging',
      logBody: 'Fixture content for messaging scenarios; use alongside seeded threads when available.',
    },
  },
  payments: {
    id: 'payments',
    title: 'Test: payments/tokens',
    summary: 'ELSA/token flows and payment triggers',
    scenarios: [
      {
        slug: 'elsa/topup',
        description: 'Top up tokens for a user and verify balances/ledger entries.',
        runCadence: 'repeat-3',
      },
      {
        slug: 'elsa/reward',
        description: 'Reward task completion and confirm caps/abuse guards.',
        runCadence: 'repeat-3',
      },
      ...DEFAULT_SCENARIOS,
    ],
    requiredElsa: CREATION_ELSA_REQUIREMENT,
    fixtures: {
      logSlug: 'test-payments-fixture-log',
      logHeadline: 'Fixture log for payments',
      logBody: 'Fixture content for payments/ELSA scenarios; pair with ledger checks.',
    },
  },
};

export const resolveTestPack = (id: string): TestPack => {
  const normalized = id.trim().toLowerCase();
  if (TEST_PACKS[normalized]) {
    return TEST_PACKS[normalized];
  }
  return {
    id,
    title: `Test: ${id}`,
    summary: `Regression pack for ${id}`,
    scenarios: DEFAULT_SCENARIOS,
    requiredElsa: CREATION_ELSA_REQUIREMENT,
    fixtures: {
      logSlug: `test-${normalized}-fixture-log`,
      logHeadline: `Fixture log for ${id}`,
      logBody: `Deterministic fixture log for testcase "${id}".`,
    },
  };
};

export const resolvePackElsaRequirement = (pack: string | TestPack): TestPackElsaRequirement => {
  const resolvedPack = typeof pack === 'string' ? resolveTestPack(pack) : pack;
  return normalizeElsaRequirement(resolvedPack.requiredElsa);
};

export const resolveRequiredElsaForRole = (
  pack: string | TestPack,
  role: CrewRole,
): number => {
  const requirements = resolvePackElsaRequirement(pack);
  if (role === 'captain') {
    return requirements.captain ?? requirements.crew ?? 0;
  }
  return requirements.crew ?? requirements.captain ?? 0;
};

export const defaultScenarios = DEFAULT_SCENARIOS;
export const testPacks = TEST_PACKS;
