export const FLIGHT_PLAN_TASK_STATES = [
  'ideation',
  'grooming',
  'ready',
  'in-progress',
  'review',
  'done',
  'live',
] as const;

export type FlightPlanTaskState = (typeof FLIGHT_PLAN_TASK_STATES)[number];

export type FlightPlanTaskStateMeta = {
  id: FlightPlanTaskState;
  label: string;
  description: string;
  order: number;
  icon: 'spark' | 'compass' | 'flag' | 'thrusters' | 'scan' | 'check' | 'beacon';
};

const STATE_META: Record<FlightPlanTaskState, FlightPlanTaskStateMeta> = {
  ideation: {
    id: 'ideation',
    label: 'Ideation',
    description: 'Initial brain dump for loose ideas.',
    order: 0,
    icon: 'spark',
  },
  grooming: {
    id: 'grooming',
    label: 'Grooming',
    description: 'Clarifying scope, dependencies, and estimates.',
    order: 1,
    icon: 'compass',
  },
  ready: {
    id: 'ready',
    label: 'Ready',
    description: 'Scoped and available to pick up.',
    order: 2,
    icon: 'flag',
  },
  'in-progress': {
    id: 'in-progress',
    label: 'In progress',
    description: 'Actively being worked.',
    order: 3,
    icon: 'thrusters',
  },
  review: {
    id: 'review',
    label: 'Review',
    description: 'Awaiting async or pairing review.',
    order: 4,
    icon: 'scan',
  },
  done: {
    id: 'done',
    label: 'Done',
    description: 'Code landed and ready for deploy.',
    order: 5,
    icon: 'check',
  },
  live: {
    id: 'live',
    label: 'Live',
    description: 'Fully deployed and verified.',
    order: 6,
    icon: 'beacon',
  },
};

export const getFlightPlanTaskStateMeta = (state: FlightPlanTaskState): FlightPlanTaskStateMeta =>
  STATE_META[state] ?? STATE_META.ideation;

export const FLIGHT_PLAN_TASK_STATE_OPTIONS = FLIGHT_PLAN_TASK_STATES.map((state) => ({
  label: STATE_META[state].label,
  value: state,
}));

export const sortFlightPlanTaskStates = (
  states: FlightPlanTaskState[],
): FlightPlanTaskState[] =>
  [...states].sort((a, b) => STATE_META[a].order - STATE_META[b].order);
