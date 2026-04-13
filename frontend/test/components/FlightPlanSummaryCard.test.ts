import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import FlightPlanSummaryCard from '~/components/FlightPlanSummaryCard.vue';
import type { FlightPlanSummary } from '~/modules/api/schemas';

const basePlan: FlightPlanSummary = {
  id: 1,
  title: 'Mission Alpha',
  slug: 'mission-alpha',
  href: '/bridge/flight-plans/mission-alpha',
  summary: 'Test summary',
  body: [],
  category: 'event',
  status: 'ongoing',
  statusBucket: 'active',
  statusChangedAt: null,
  statusChangedBy: null,
  statusReason: null,
  startedAt: null,
  finishedAt: null,
  series: null,
  iterationNumber: 1,
  previousIterationId: null,
  location: 'Orbit',
  dateCode: '20250101',
  displayDate: 'Jan 1, 2025',
  eventDate: '2025-01-01',
  date: '2025-01-01',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  owner: null,
  crewPreview: [],
  crewCanPromotePassengers: false,
  passengersCanCreateTasks: false,
  isPublic: true,
  publicContributions: false,
  gallerySlides: [],
};

describe('FlightPlanSummaryCard', () => {
  it('renders category and lifecycle badges', () => {
    const wrapper = mount(FlightPlanSummaryCard, {
      props: {
        plan: basePlan,
      },
    });
    expect(wrapper.text()).toContain('Event');
    expect(wrapper.text()).toContain('Ongoing');
    expect(wrapper.text()).toContain('Active');
  });
});
