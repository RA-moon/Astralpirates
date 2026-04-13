import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import FlightPlanLifecycleControls from '~/components/flight-plans/FlightPlanLifecycleControls.vue';
import type { FlightPlanSummary } from '~/modules/api/schemas';

const makePlan = (overrides: Partial<FlightPlanSummary> = {}): FlightPlanSummary => ({
  id: 1,
  title: 'Mission One',
  slug: 'mission-one',
  href: '/bridge/flight-plans/mission-one',
  summary: null,
  body: [],
  category: 'project',
  status: 'planned',
  statusBucket: 'archived',
  statusChangedAt: null,
  statusChangedBy: null,
  statusReason: null,
  startedAt: null,
  finishedAt: null,
  series: null,
  iterationNumber: 1,
  previousIterationId: null,
  location: null,
  dateCode: null,
  displayDate: null,
  eventDate: null,
  date: null,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  owner: null,
  crewPreview: [],
  crewCanPromotePassengers: false,
  passengersCanCreateTasks: false,
  isPublic: false,
  publicContributions: false,
  gallerySlides: [],
  ...overrides,
});

describe('FlightPlanLifecycleControls', () => {
  it('renders lifecycle badges', () => {
    const wrapper = mount(FlightPlanLifecycleControls, {
      props: {
        plan: makePlan({ status: 'ongoing', statusBucket: 'active' }),
        canManage: true,
      },
    });

    expect(wrapper.text()).toContain('Ongoing');
    expect(wrapper.text()).toContain('Active');
  });

  it('requires reason for reason-mandatory status transitions', async () => {
    const wrapper = mount(FlightPlanLifecycleControls, {
      props: {
        plan: makePlan({ status: 'ongoing' }),
        canManage: true,
      },
    });

    await wrapper.find('select').setValue('failure');
    await wrapper.find('button').trigger('click');

    expect(wrapper.emitted('transition')).toBeUndefined();
    expect(wrapper.text()).toContain('statusReason is required');

    await wrapper.find('textarea').setValue(
      'Mission failed due to propulsion instability and telemetry mismatch.',
    );
    await wrapper.find('button').trigger('click');

    expect(wrapper.emitted('transition')).toEqual([
      [
        {
          status: 'failure',
          statusReason: 'Mission failed due to propulsion instability and telemetry mismatch.',
        },
      ],
    ]);
  });

  it('shows iteration availability hint for non-terminal missions', () => {
    const wrapper = mount(FlightPlanLifecycleControls, {
      props: {
        plan: makePlan({ status: 'ongoing', statusBucket: 'active' }),
        canManage: true,
      },
    });

    expect(wrapper.text()).toContain(
      'Create next iteration unlocks after a terminal status (Success, Failure, Aborted, or Cancelled).',
    );
  });

  it('requires eventDate when creating event iterations', async () => {
    const wrapper = mount(FlightPlanLifecycleControls, {
      props: {
        plan: makePlan({ category: 'event', status: 'success', statusBucket: 'finished' }),
        canManage: true,
      },
    });

    const createButton = wrapper
      .findAll('button')
      .find((entry) => entry.text().includes('Create next iteration'));
    expect(createButton).toBeTruthy();

    await createButton?.trigger('click');
    expect(wrapper.emitted('createIteration')).toBeUndefined();
    expect(wrapper.text()).toContain('Event iterations require a new eventDate.');

    const dateInput = wrapper.find('input[type="date"]');
    await dateInput.setValue('2026-04-08');
    await createButton?.trigger('click');

    expect(wrapper.emitted('createIteration')).toEqual([
      [
        {
          title: undefined,
          eventDate: '2026-04-08',
        },
      ],
    ]);
  });
});
