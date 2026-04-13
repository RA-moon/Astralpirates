import type { FlightPlanTaskState } from '@astralpirates/shared/taskStates';

export type MissionTaskFixture = {
  title: string;
  description: string;
  state: FlightPlanTaskState;
  order: number;
};

type FixtureBlueprint = {
  title: string;
  description: string;
  state: FlightPlanTaskState;
};

const BLUEPRINTS: FixtureBlueprint[] = [
  {
    title: 'Draft the mission brief for {mission}',
    description:
      'Capture the “why now” story, constraints, and the first set of deliverables so crew understand the scope.',
    state: 'ideation',
  },
  {
    title: 'Share a short roster shortlist',
    description:
      'Ping two organisers who can own intake and identify any skill gaps. List them in the notes so Control can follow along.',
    state: 'grooming',
  },
  {
    title: 'Stage the bridge review kit',
    description:
      'Collect gallery assets, invite summaries, and open questions before we schedule the dry-run on the bridge stream.',
    state: 'review',
  },
];

const formatMissionLabel = (title?: string | null) => {
  if (typeof title === 'string' && title.trim().length > 0) {
    return `“${title.trim()}”`;
  }
  return 'this mission';
};

export const buildMissionTaskFixtures = (planTitle?: string | null): MissionTaskFixture[] => {
  const missionLabel = formatMissionLabel(planTitle);
  return BLUEPRINTS.map((fixture, index) => ({
    title: fixture.title.replace('{mission}', missionLabel),
    description: fixture.description.replace('{mission}', missionLabel),
    state: fixture.state,
    order: index,
  }));
};
