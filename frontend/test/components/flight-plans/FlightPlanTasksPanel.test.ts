import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { getFlightPlanTaskStateMeta } from '@astralpirates/shared/api-contracts';
import FlightPlanTasksPanel from '~/components/flight-plans/FlightPlanTasksPanel.vue';
import type { FlightPlanTask } from '~/modules/api/schemas';

const buildTask = (overrides: Partial<FlightPlanTask>): FlightPlanTask => ({
  id: 1,
  flightPlanId: 1,
  title: 'Task',
  description: [],
  state: 'ideation',
  listOrder: 1,
  ownerMembershipId: 1,
  owner: null,
  assigneeMembershipIds: [],
  assignees: [],
  attachments: [],
  links: [],
  isCrewOnly: false,
  version: 1,
  createdAt: '2025-12-26T00:00:00.000Z',
  updatedAt: '2025-12-26T00:00:00.000Z',
  ...overrides,
});

const mountPanel = (states: Array<{ id: string; tasks: FlightPlanTask[] }>) =>
  mount(FlightPlanTasksPanel, {
    props: {
      states: states.map((state) => ({
        id: state.id,
        meta: getFlightPlanTaskStateMeta(state.id as any),
        tasks: state.tasks,
      })),
      crewMembers: [],
      canEdit: true,
      canCreate: true,
      loading: false,
      viewerMembershipId: 1,
      viewerIsCaptain: true,
      canClaim: false,
      creatingTask: false,
      isTaskUpdating: () => false,
      isTaskDeleting: () => false,
    },
    global: {
      stubs: {
        UiSurface: true,
        UiStack: true,
        UiInline: true,
        UiHeading: true,
        UiText: true,
        UiTaskStatePill: true,
        UiEmptyState: true,
        UiFormField: true,
        UiTextInput: true,
        UiTextArea: true,
        UiSelect: true,
        UiMultiSelect: true,
        UiButton: true,
        UiIconButton: true,
        UiTag: true,
        UiFileInput: true,
        RichTextRenderer: true,
        CommentThread: true,
        AvatarMediaRenderer: true,
      },
    },
  });

describe('FlightPlanTasksPanel', () => {
  it('emits listOrder updates when tasks are dropped within the same state', async () => {
    const taskA = buildTask({ id: 1, title: 'A', listOrder: 1, state: 'ideation' });
    const taskB = buildTask({ id: 2, title: 'B', listOrder: 2, state: 'ideation' });
    const wrapper = mountPanel([
      { id: 'ideation', tasks: [taskA, taskB] },
      { id: 'grooming', tasks: [] },
    ]);

    const cards = wrapper.findAll('.flight-plan-tasks__card');
    await cards[0].trigger('dragstart', {
      dataTransfer: { setData: vi.fn(), effectAllowed: '' },
    });
    const column = wrapper.findAll('.flight-plan-tasks__column')[0];
    await column.trigger('dragover');
    await column.trigger('drop');

    const updates = wrapper.emitted('update') ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toMatchObject({
      taskId: 1,
      data: { listOrder: 3 },
    });
  });

  it('emits state + listOrder updates when tasks are dropped across states', async () => {
    const taskA = buildTask({ id: 1, title: 'A', listOrder: 1, state: 'ideation' });
    const taskB = buildTask({ id: 2, title: 'B', listOrder: 4, state: 'grooming' });
    const wrapper = mountPanel([
      { id: 'ideation', tasks: [taskA] },
      { id: 'grooming', tasks: [taskB] },
    ]);

    const cards = wrapper.findAll('.flight-plan-tasks__card');
    await cards[0].trigger('dragstart', {
      dataTransfer: { setData: vi.fn(), effectAllowed: '' },
    });
    const columns = wrapper.findAll('.flight-plan-tasks__column');
    await columns[1].trigger('dragover');
    await columns[1].trigger('drop');

    const updates = wrapper.emitted('update') ?? [];
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toMatchObject({
      taskId: 1,
      data: { state: 'grooming', listOrder: 5 },
    });
  });
});
