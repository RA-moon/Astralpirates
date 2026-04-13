export const TEST_RUN_CADENCES = ['on-touch', 'on-update', 'repeat-1', 'repeat-2', 'repeat-3', 'never'] as const;

export type TestRunCadence = (typeof TEST_RUN_CADENCES)[number];

const CADENCE_LABELS: Record<TestRunCadence, string> = {
  'on-touch': 'OnTouch',
  'on-update': 'OnUpdate',
  'repeat-1': 'Repeat1',
  'repeat-2': 'Repeat2',
  'repeat-3': 'Repeat3',
  never: 'Never',
};

export const TEST_RUN_CADENCE_OPTIONS = TEST_RUN_CADENCES.map((cadence) => ({
  label: CADENCE_LABELS[cadence],
  value: cadence,
}));

export const DEFAULT_TEST_RUN_CADENCE: TestRunCadence = 'repeat-1';
