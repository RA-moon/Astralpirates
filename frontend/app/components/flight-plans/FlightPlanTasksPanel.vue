<template>
  <UiSurface variant="panel" class="flight-plan-tasks">
    <UiStack :gap="'var(--space-md)'">
      <header class="flight-plan-tasks__header">
        <UiInline justify="between" align="center">
          <div>
            <UiHeading :level="2" size="h4" :uppercase="false">Mission tasks</UiHeading>
            <UiText variant="muted">
              Track ideation through launch with crew-only owners and assignees.
            </UiText>
          </div>
          <UiTaskStatePill v-if="lastStateId" :state="lastStateId" />
        </UiInline>
      </header>

      <form v-if="canCreate" class="flight-plan-tasks__form" @submit.prevent="submitNewTask">
        <UiStack :gap="'var(--space-sm)'">
          <UiFormField label="Title" :required="true">
            <template #default="{ id, describedBy }">
              <UiTextInput
                v-model="newTask.title"
                ref="newTaskTitleRef"
                :id="id"
                :described-by="describedBy"
                placeholder="Outline deliverable…"
                :disabled="creatingTask"
              />
            </template>
          </UiFormField>
          <UiFormField label="State">
            <UiSelect
              v-model="newTask.state"
              :options="stateOptions"
              :disabled="creatingTask"
            />
          </UiFormField>
          <UiFormField label="Assignees">
            <UiMultiSelect
              v-model="newTask.assigneeMembershipIds"
              :options="assigneeOptions"
              :disabled="creatingTask || !assigneeOptions.length"
              placeholder="Select crew organisers…"
            />
          </UiFormField>
          <UiFormField label="Notes">
            <UiTextArea
              v-model="newTask.description"
              placeholder="Optional context, links, or blockers."
              :disabled="creatingTask"
            />
          </UiFormField>
          <UiInline :gap="'var(--space-sm)'">
            <UiButton type="submit" :loading="creatingTask" :disabled="creatingTask || !newTask.title.trim()">
              Add task
            </UiButton>
            <UiButton type="button" variant="ghost" :disabled="creatingTask" @click="resetForm">
              Reset
            </UiButton>
          </UiInline>
          <UiAlert v-if="formError" variant="danger" layout="inline">{{ formError }}</UiAlert>
        </UiStack>
      </form>

      <div class="flight-plan-tasks__grid-wrapper">
        <div v-if="showSkeletons" class="flight-plan-tasks__skeleton-grid">
          <div
            v-for="index in 3"
            :key="`skeleton-${index}`"
            class="flight-plan-tasks__skeleton-column"
          >
            <div class="flight-plan-tasks__skeleton-bar" />
            <div class="flight-plan-tasks__skeleton-card" />
          </div>
        </div>
        <UiEmptyState
          v-else-if="showEmptyState"
          title="Mission tasks keep crews aligned"
          :description="emptyStateDescription"
        >
          <template v-if="canCreate" #actions>
            <UiButton type="button" variant="secondary" @click="focusNewTaskField">
              Start a task
            </UiButton>
          </template>
        </UiEmptyState>
        <div v-else class="flight-plan-tasks__grid">
          <section
            v-for="state in states"
            :key="state.id"
            class="flight-plan-tasks__column"
            :class="{ 'flight-plan-tasks__column--drop': isDropColumn(state.id) }"
            @dragover.prevent="(event) => handleColumnDragOver(state.id, event)"
            @drop.prevent="() => handleDrop(state.id)"
          >
            <UiInline align="center" justify="between">
              <UiInline align="center" :gap="'var(--space-2xs)'">
                <UiTaskStatePill :state="state.id" />
                <UiText variant="muted">({{ state.tasks.length }})</UiText>
              </UiInline>
            </UiInline>
            <UiStack v-if="state.tasks.length" :gap="'var(--space-sm)'" class="flight-plan-tasks__cards">
              <article
                v-for="task in state.tasks"
                :key="task.id"
                class="flight-plan-tasks__card"
                :class="{
                  'flight-plan-tasks__card--draggable': viewerCanEditTask(task),
                  'flight-plan-tasks__card--dragging': isDraggingTask(task.id),
                  'flight-plan-tasks__card--drop-before': isDropTarget(state.id, task.id, 'before'),
                  'flight-plan-tasks__card--drop-after': isDropTarget(state.id, task.id, 'after'),
                }"
                :draggable="viewerCanEditTask(task) && !isTaskUpdating(task.id)"
                @dragstart="(event) => handleDragStart(task, state.id, event)"
                @dragend="handleDragEnd"
                @dragover.prevent.stop="(event) => handleCardDragOver(state.id, task.id, event)"
                @drop.prevent.stop="() => handleDrop(state.id)"
              >
                <UiInline justify="between" align="start">
                  <div>
                    <UiHeading :level="3" size="h6" :uppercase="false">
                      {{ task.title }}
                    </UiHeading>
                    <UiText v-if="task.owner" class="flight-plan-tasks__owner">
                      Owner: {{ task.owner.displayName }}
                    </UiText>
                  </div>
                  <UiInline :gap="'var(--space-2xs)'" align="center">
                    <UiSelect
                      v-if="viewerCanEditTask(task)"
                      :model-value="task.state"
                      :options="stateOptions"
                      size="sm"
                      :disabled="isTaskUpdating(task.id)"
                      aria-label="Update task state"
                      @update:model-value="(next) => handleStateChange(task, next)"
                    />
                    <UiIconButton
                      v-if="viewerCanDeleteTask(task)"
                      :disabled="isTaskDeleting(task.id)"
                      aria-label="Delete task"
                      variant="ghost"
                      @click="() => handleDelete(task)"
                    >
                      ✕
                    </UiIconButton>
                  </UiInline>
                </UiInline>

                <div
                  v-if="viewerCanEditTask(task) && (nextStateFor(task.state) || previousStateFor(task.state))"
                  class="flight-plan-tasks__quick-actions"
                >
                  <UiButton
                    v-if="previousStateFor(task.state)"
                    size="sm"
                    variant="ghost"
                    :disabled="isTaskUpdating(task.id)"
                    @click="() => handleQuickMove(task, 'backward')"
                  >
                    Move to {{ previousStateFor(task.state)?.meta.label }}
                  </UiButton>
                  <UiButton
                    v-if="nextStateFor(task.state)"
                    size="sm"
                    variant="ghost"
                    :disabled="isTaskUpdating(task.id)"
                    @click="() => handleQuickMove(task, 'forward')"
                  >
                    Move to {{ nextStateFor(task.state)?.meta.label }}
                  </UiButton>
                </div>
                <div v-else-if="canClaim" class="flight-plan-tasks__claim-actions">
                  <UiButton
                    v-if="!viewerIsTaskOwner(task)"
                    size="sm"
                    variant="secondary"
                    :disabled="isTaskUpdating(task.id)"
                    @click="() => handleClaim(task)"
                  >
                    Take this task
                  </UiButton>
                  <UiButton
                    v-else
                    size="sm"
                    variant="ghost"
                    :disabled="isTaskUpdating(task.id)"
                    @click="() => handleUnclaim(task)"
                  >
                    Unclaim
                  </UiButton>
                </div>

                <div v-if="task.description?.length" class="flight-plan-tasks__description">
                  <RichTextRenderer :content="task.description" />
                </div>

                <div class="flight-plan-tasks__resources">
                  <div class="flight-plan-tasks__resource">
                    <UiText variant="muted">Attachments</UiText>
                    <ul v-if="task.attachments.length" class="flight-plan-tasks__resource-list">
                      <li
                        v-for="attachment in task.attachments"
                        :key="attachment.id"
                        class="flight-plan-tasks__resource-item"
                      >
                        <a
                          class="flight-plan-tasks__resource-link"
                          :href="attachment.url"
                          target="_blank"
                          rel="noopener"
                        >
                          {{ formatAttachmentLabel(attachment) }}
                        </a>
                        <span v-if="attachment.size" class="flight-plan-tasks__resource-meta">
                          {{ formatBytes(attachment.size) }}
                        </span>
                        <UiButton
                          v-if="viewerCanEditTask(task)"
                          size="sm"
                          variant="ghost"
                          :disabled="isTaskUpdating(task.id)"
                          @click="() => handleAttachmentRemove(task, attachment.id)"
                        >
                          Remove
                        </UiButton>
                      </li>
                    </ul>
                    <UiText v-else variant="caption" class="flight-plan-tasks__resource-empty">
                      No attachments yet.
                    </UiText>
                    <UiFormField v-if="viewerCanEditTask(task)" label="Add attachment">
                      <UiFileInput
                        :disabled="isTaskUpdating(task.id)"
                        @change="(event) => handleAttachmentUpload(task, event)"
                      />
                    </UiFormField>
                  </div>
                  <div class="flight-plan-tasks__resource">
                    <UiText variant="muted">Links</UiText>
                    <ul v-if="task.links.length" class="flight-plan-tasks__resource-list">
                      <li
                        v-for="link in task.links"
                        :key="link.id"
                        class="flight-plan-tasks__resource-item"
                      >
                        <a
                          class="flight-plan-tasks__resource-link"
                          :href="link.url"
                          target="_blank"
                          rel="noopener"
                        >
                          {{ link.title?.trim() || link.url }}
                        </a>
                        <UiButton
                          v-if="viewerCanEditTask(task)"
                          size="sm"
                          variant="ghost"
                          :disabled="isTaskUpdating(task.id)"
                          @click="() => handleLinkRemove(task, link.id)"
                        >
                          Remove
                        </UiButton>
                      </li>
                    </ul>
                    <UiText v-else variant="caption" class="flight-plan-tasks__resource-empty">
                      No links yet.
                    </UiText>
                    <div v-if="viewerCanEditTask(task)" class="flight-plan-tasks__link-form">
                      <UiFormField label="Add link" :error="linkErrors[task.id] || ''">
                        <UiTextInput
                          :model-value="linkUrlInputs[task.id] || ''"
                          :disabled="isTaskUpdating(task.id)"
                          placeholder="https://..."
                          @update:model-value="(value) => updateLinkUrl(task.id, value)"
                        />
                      </UiFormField>
                      <UiFormField label="Label (optional)">
                        <UiTextInput
                          :model-value="linkTitleInputs[task.id] || ''"
                          :disabled="isTaskUpdating(task.id)"
                          placeholder="Short label"
                          @update:model-value="(value) => updateLinkTitle(task.id, value)"
                        />
                      </UiFormField>
                      <UiButton
                        size="sm"
                        variant="secondary"
                        :disabled="isTaskUpdating(task.id)"
                        @click="() => handleLinkSubmit(task)"
                      >
                        Add link
                      </UiButton>
                    </div>
                  </div>
                </div>

                <div class="flight-plan-tasks__assignees">
                  <UiText variant="muted">Assignees:</UiText>
                  <div v-if="task.assignees.length" class="flight-plan-tasks__assignee-list">
                    <UiTag
                      v-for="assignee in task.assignees"
                      :key="assignee.id"
                      class="flight-plan-tasks__assignee-chip"
                      variant="muted"
                    >
                      <span class="flight-plan-tasks__assignee-avatar">
                        <AvatarMediaRenderer
                          class="flight-plan-tasks__assignee-renderer"
                          :avatar-url="assignee.avatarUrl ?? null"
                          :avatar-media-type="assignee.avatarMediaType ?? null"
                          :avatar-media-url="assignee.avatarMediaUrl ?? null"
                          :avatar-mime-type="assignee.avatarMimeType ?? null"
                          :avatar-filename="assignee.avatarFilename ?? null"
                          :alt="`${assignee.displayName} avatar`"
                          :compact="true"
                        />
                      </span>
                      <span>{{ assignee.displayName }}</span>
                    </UiTag>
                  </div>
              <UiText v-else variant="muted">Unassigned</UiText>
            </div>

            <UiMultiSelect
              v-if="canEdit"
                  :model-value="task.assigneeMembershipIds.map(String)"
                  :options="assigneeOptions"
                  :disabled="isTaskUpdating(task.id)"
                  placeholder="Assign crew"
                  @update:model-value="(next) => handleAssigneesChange(task, next)"
                />

                <UiFormField v-if="viewerIsTaskOwner(task)" label="Transfer owner">
                  <UiSelect
                    :model-value="String(task.ownerMembershipId)"
                    :options="assigneeOptions"
                    :disabled="isTaskUpdating(task.id)"
                @update:model-value="(next) => handleOwnerChange(task, next)"
              />
            </UiFormField>

            <div class="flight-plan-tasks__discussion-toggle">
              <UiButton
                size="sm"
                variant="ghost"
                @click="() => toggleDiscussion(task.id)"
              >
                {{ openThreads[task.id] ? 'Hide discussion' : 'Discuss' }}
              </UiButton>
            </div>
            <div v-if="openThreads[task.id]" class="flight-plan-tasks__discussion">
              <CommentThread
                :resource-type="'flight-plan-task'"
                :resource-id="task.id"
                :title="task.title"
                :open="openThreads[task.id]"
              />
            </div>
          </article>
        </UiStack>
        <UiText v-else variant="muted" class="flight-plan-tasks__empty">
          No tasks in {{ state.meta.label.toLowerCase() }}.
        </UiText>
          </section>
        </div>
      </div>
    </UiStack>
  </UiSurface>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import {
  UiAlert,
  UiButton,
  UiEmptyState,
  UiFileInput,
  UiFormField,
  UiHeading,
  UiIconButton,
  UiInline,
  UiMultiSelect,
  UiSelect,
  UiStack,
  UiSurface,
  UiTag,
  UiTaskStatePill,
  UiText,
  UiTextArea,
  UiTextInput,
} from '~/components/ui';
import type { FlightPlanTask, FlightPlanTaskStateMeta } from '~/modules/api/schemas';
import type { FlightPlanMember } from '~/domains/flightPlans/api';
import CommentThread from '~/components/comments/CommentThread.vue';
import AvatarMediaRenderer from '~/components/AvatarMediaRenderer.vue';

type FlightPlanTaskState = FlightPlanTask['state'];

type TaskStateBucket = {
  id: FlightPlanTaskState;
  meta: FlightPlanTaskStateMeta;
  tasks: FlightPlanTask[];
};

const props = defineProps<{
  states: TaskStateBucket[];
  crewMembers: FlightPlanMember[];
  canEdit: boolean;
  canCreate: boolean;
  loading: boolean;
  viewerMembershipId: number | null;
  viewerIsCaptain: boolean;
  canClaim: boolean;
  creatingTask: boolean;
  isTaskUpdating: (taskId: number) => boolean;
  isTaskDeleting: (taskId: number) => boolean;
}>();

const emit = defineEmits<{
  (e: 'create', payload: { title: string; description?: string; state?: string; assigneeMembershipIds?: number[] }): void;
  (e: 'update', payload: { taskId: number; data: Record<string, unknown> }): void;
  (e: 'delete', taskId: number): void;
  (e: 'claim', taskId: number): void;
  (e: 'unclaim', taskId: number): void;
  (e: 'add-attachment', payload: { taskId: number; file: File }): void;
  (e: 'remove-attachment', payload: { taskId: number; attachmentId: string }): void;
  (e: 'add-link', payload: { taskId: number; url: string; title?: string }): void;
  (e: 'remove-link', payload: { taskId: number; linkId: string }): void;
}>();

type DragState = { taskId: number; stateId: string };
type DropPlacement = 'before' | 'after' | 'end';
type DropTarget = { stateId: string; taskId: number | null; placement: DropPlacement };

const openThreads = reactive<Record<number, boolean>>({});
const linkUrlInputs = reactive<Record<number, string>>({});
const linkTitleInputs = reactive<Record<number, string>>({});
const linkErrors = reactive<Record<number, string>>({});
const dragging = ref<DragState | null>(null);
const dropTarget = ref<DropTarget | null>(null);

const newTask = reactive<{
  title: string;
  state: FlightPlanTaskState;
  assigneeMembershipIds: string[];
  description: string;
}>({
  title: '',
  state: 'ideation',
  assigneeMembershipIds: [] as string[],
  description: '',
});
const newTaskTitleRef = ref<InstanceType<typeof UiTextInput> | null>(null);

const formError = ref<string | null>(null);
const canClaim = computed(() => props.canClaim);

const stateOptions = computed(() =>
  props.states.map((state) => ({
    label: state.meta.label,
    value: state.id,
  })),
);

const assignableMembers = computed(() =>
  props.crewMembers.filter(
    (member) => member.status === 'accepted' && (member.role === 'owner' || member.role === 'crew'),
  ),
);

const assigneeOptions = computed(() =>
  assignableMembers.value.map((member) => ({
    label:
      member.user?.callSign ??
      member.user?.profileSlug ??
      member.user?.role ??
      `Crew ${member.id}`,
    value: String(member.id),
  })),
);

const totalTasks = computed(() => props.states.reduce((count, state) => count + state.tasks.length, 0));
const showSkeletons = computed(() => props.loading && totalTasks.value === 0);
const showEmptyState = computed(() => !props.loading && totalTasks.value === 0);
const emptyStateDescription = computed(() =>
  props.canCreate
    ? 'Map the work, assign owners, and review every state change directly on the bridge.'
    : 'Only authorised crew can start mission tasks.',
);
const lastStateId = computed<FlightPlanTaskState | null>(
  () => props.states[props.states.length - 1]?.id ?? null,
);

const stateIndexMap = computed(() => {
  const map = new Map<FlightPlanTaskState, number>();
  props.states.forEach((state, index) => map.set(state.id, index));
  return map;
});

const resolveAdjacentState = (stateId: FlightPlanTaskState, offset: number) => {
  const currentIndex = stateIndexMap.value.get(stateId);
  if (currentIndex == null) return null;
  return props.states[currentIndex + offset] ?? null;
};

const nextStateFor = (stateId: FlightPlanTaskState) => resolveAdjacentState(stateId, 1);
const previousStateFor = (stateId: FlightPlanTaskState) => resolveAdjacentState(stateId, -1);

const resetForm = () => {
  newTask.title = '';
  newTask.description = '';
  newTask.state = 'ideation';
  newTask.assigneeMembershipIds = [];
  formError.value = null;
};

const submitNewTask = async () => {
  if (!newTask.title.trim()) {
    formError.value = 'Task title is required.';
    return;
  }
  formError.value = null;
  emit('create', {
    title: newTask.title.trim(),
    state: newTask.state,
    assigneeMembershipIds: newTask.assigneeMembershipIds.map((value) => Number.parseInt(value, 10)),
    description: newTask.description.trim() ? newTask.description.trim() : undefined,
  });
};

const handleStateChange = (task: FlightPlanTask, nextState: string | number | null) => {
  const normalized = typeof nextState === 'string' ? nextState : String(nextState ?? '');
  if (normalized && normalized !== task.state) {
    emit('update', { taskId: task.id, data: { state: normalized } });
  }
};

const handleAssigneesChange = (task: FlightPlanTask, next: Array<string | number>) => {
  const ids = next.map((value) => Number.parseInt(String(value), 10)).filter((id) => Number.isFinite(id));
  emit('update', { taskId: task.id, data: { assigneeMembershipIds: ids } });
};

const handleOwnerChange = (task: FlightPlanTask, next: string | number | null) => {
  const id = Number.parseInt(String(next ?? ''), 10);
  if (Number.isFinite(id) && id !== task.ownerMembershipId) {
    emit('update', { taskId: task.id, data: { ownerMembershipId: id } });
  }
};

const handleDelete = (task: FlightPlanTask) => {
  emit('delete', task.id);
};

const viewerIsTaskOwner = (task: FlightPlanTask) =>
  props.viewerMembershipId != null && props.viewerMembershipId === task.ownerMembershipId;
const viewerCanEditTask = (task: FlightPlanTask) =>
  props.canEdit || (props.canCreate && viewerIsTaskOwner(task));
const viewerCanDeleteTask = (task: FlightPlanTask) =>
  (props.viewerIsCaptain || viewerIsTaskOwner(task)) && viewerCanEditTask(task);

const isDraggingTask = (taskId: number) => dragging.value?.taskId === taskId;
const isDropTarget = (stateId: string, taskId: number, placement: DropPlacement) => {
  const target = dropTarget.value;
  return Boolean(
    target &&
      target.stateId === stateId &&
      target.taskId === taskId &&
      target.placement === placement,
  );
};
const isDropColumn = (stateId: string) => {
  const target = dropTarget.value;
  return Boolean(target && target.stateId === stateId && target.placement === 'end');
};

const handleDragStart = (task: FlightPlanTask, stateId: string, event: DragEvent) => {
  if (!viewerCanEditTask(task) || props.isTaskUpdating(task.id)) {
    event.preventDefault();
    return;
  }
  dragging.value = { taskId: task.id, stateId };
  dropTarget.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(task.id));
  }
};

const handleDragEnd = () => {
  dragging.value = null;
  dropTarget.value = null;
};

const handleCardDragOver = (stateId: string, taskId: number, event: DragEvent) => {
  if (!dragging.value) return;
  const target = event.currentTarget as HTMLElement | null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const placement: DropPlacement = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
  dropTarget.value = { stateId, taskId, placement };
};

const handleColumnDragOver = (stateId: string, _event: DragEvent) => {
  if (!dragging.value) return;
  dropTarget.value = { stateId, taskId: null, placement: 'end' };
};

const resolveOrderValue = (task: FlightPlanTask, fallback: number) =>
  typeof task.listOrder === 'number' ? task.listOrder : fallback;

const computeListOrder = (tasks: FlightPlanTask[], targetIndex: number) => {
  const before = targetIndex > 0 ? tasks[targetIndex - 1] : null;
  const after = targetIndex < tasks.length ? tasks[targetIndex] : null;
  const beforeOrder = before ? resolveOrderValue(before, targetIndex - 1) : null;
  const afterOrder = after ? resolveOrderValue(after, targetIndex) : null;

  if (beforeOrder != null && afterOrder != null) {
    if (beforeOrder === afterOrder) return beforeOrder + 1;
    return beforeOrder + (afterOrder - beforeOrder) / 2;
  }
  if (beforeOrder != null) return beforeOrder + 1;
  if (afterOrder != null) return afterOrder - 1;
  return 0;
};

const handleDrop = (stateId: string) => {
  if (!dragging.value) return;
  const source = dragging.value;
  const targetStateId = stateId;
  const targetState = props.states.find((state) => state.id === targetStateId);
  if (!targetState) {
    handleDragEnd();
    return;
  }

  const targetTasks = targetState.tasks ?? [];
  const filteredTargetTasks =
    source.stateId === targetStateId
      ? targetTasks.filter((task) => task.id !== source.taskId)
      : [...targetTasks];

  let targetIndex = filteredTargetTasks.length;
  if (dropTarget.value?.stateId === targetStateId && dropTarget.value.taskId != null) {
    const baseIndex = filteredTargetTasks.findIndex((task) => task.id === dropTarget.value?.taskId);
    if (baseIndex >= 0) {
      targetIndex = dropTarget.value.placement === 'after' ? baseIndex + 1 : baseIndex;
    }
  }

  if (source.stateId === targetStateId) {
    const currentIndex = targetTasks.findIndex((task) => task.id === source.taskId);
    if (currentIndex === targetIndex) {
      handleDragEnd();
      return;
    }
  }

  const listOrder = computeListOrder(filteredTargetTasks, targetIndex);
  const data: Record<string, unknown> = { listOrder };
  if (source.stateId !== targetStateId) {
    data.state = targetStateId;
  }
  emit('update', { taskId: source.taskId, data });
  handleDragEnd();
};

const handleQuickMove = (task: FlightPlanTask, direction: 'forward' | 'backward') => {
  const target = direction === 'forward' ? nextStateFor(task.state) : previousStateFor(task.state);
  if (!target) return;
  emit('update', { taskId: task.id, data: { state: target.id } });
};

const handleClaim = (task: FlightPlanTask) => {
  emit('claim', task.id);
};

const handleUnclaim = (task: FlightPlanTask) => {
  emit('unclaim', task.id);
};

const updateLinkUrl = (taskId: number, value: string) => {
  linkUrlInputs[taskId] = value;
  if (linkErrors[taskId]) {
    linkErrors[taskId] = '';
  }
};

const updateLinkTitle = (taskId: number, value: string) => {
  linkTitleInputs[taskId] = value;
};

const handleLinkSubmit = (task: FlightPlanTask) => {
  const url = (linkUrlInputs[task.id] || '').trim();
  if (!url) {
    linkErrors[task.id] = 'URL is required.';
    return;
  }
  const title = (linkTitleInputs[task.id] || '').trim();
  linkErrors[task.id] = '';
  emit('add-link', { taskId: task.id, url, title: title || undefined });
  linkUrlInputs[task.id] = '';
  linkTitleInputs[task.id] = '';
};

const handleLinkRemove = (task: FlightPlanTask, linkId: string) => {
  emit('remove-link', { taskId: task.id, linkId });
};

const handleAttachmentUpload = (task: FlightPlanTask, event: Event) => {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] ?? null;
  if (!file) return;
  emit('add-attachment', { taskId: task.id, file });
  if (input) input.value = '';
};

const handleAttachmentRemove = (task: FlightPlanTask, attachmentId: string) => {
  emit('remove-attachment', { taskId: task.id, attachmentId });
};

const formatAttachmentLabel = (attachment: FlightPlanTask['attachments'][number]) => {
  if (attachment.filename?.trim()) return attachment.filename.trim();
  const url = attachment.url?.trim();
  if (url) {
    const parts = url.split('/');
    return parts[parts.length - 1] || url;
  }
  return `Attachment ${attachment.assetId}`;
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value)) return '';
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
};

const focusNewTaskField = () => {
  if (!props.canCreate) return;
  newTaskTitleRef.value?.focus();
};

const toggleDiscussion = (taskId: number) => {
  openThreads[taskId] = !openThreads[taskId];
};

defineExpose({
  resetForm,
});
</script>

<style scoped>
.flight-plan-tasks {
  --flight-plan-assignee-avatar-size: calc(var(--size-avatar-sm) * 0.5);
  --flight-plan-assignee-gap: calc(var(--flight-plan-assignee-avatar-size) * 0.2333);
  --flight-plan-column-min-width: calc(var(--size-avatar-sm) * 4.5833);
  --flight-plan-border-width: var(--size-base-layout-px);
  --flight-plan-drop-indicator-width: calc(var(--size-base-layout-px) * 2 * var(--size-scale-factor));
  --flight-plan-skeleton-shimmer-width: calc(var(--size-avatar-sm) * 8.3333);
  --flight-plan-skeleton-bar-height: var(--space-sm);
  --flight-plan-skeleton-card-height: calc(var(--size-avatar-sm) * 2.5);
  --flight-plan-font-owner-size: calc(var(--crew-identity-meta-font-size) * 1.2143);
  --flight-plan-font-description-size: calc(var(--crew-identity-meta-font-size) * 1.2857);
  --flight-plan-font-resource-meta-size: calc(var(--crew-identity-meta-font-size) * 1.1429);
  --flight-plan-shimmer-offset: calc(var(--flight-plan-skeleton-shimmer-width) * 0.5);
}

.flight-plan-tasks__grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(var(--flight-plan-column-min-width), 1fr));
}

.flight-plan-tasks__grid-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.flight-plan-tasks__skeleton-grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(var(--flight-plan-column-min-width), 1fr));
}

.flight-plan-tasks__skeleton-column {
  border: var(--flight-plan-border-width) dashed var(--color-border-weak);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
  background: var(--color-surface-panel);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.flight-plan-tasks__skeleton-bar,
.flight-plan-tasks__skeleton-card {
  border-radius: var(--radius-sm);
  background: var(--gradient-skeleton);
  background-size: var(--flight-plan-skeleton-shimmer-width) 100%;
  animation: flight-plan-task-shimmer 1.4s infinite;
}

.flight-plan-tasks__skeleton-bar {
  height: var(--flight-plan-skeleton-bar-height);
}

.flight-plan-tasks__skeleton-card {
  height: var(--flight-plan-skeleton-card-height);
}

.flight-plan-tasks__column {
  border: var(--flight-plan-border-width) solid var(--color-border-weak);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
  background: var(--color-surface-panel);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.flight-plan-tasks__column--drop {
  border-color: var(--color-border-focus);
}

.flight-plan-tasks__card {
  border: var(--flight-plan-border-width) solid var(--color-border-weak);
  border-radius: var(--radius-md);
  padding: var(--space-sm);
  background: var(--color-surface-base);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.flight-plan-tasks__card--draggable {
  cursor: grab;
}

.flight-plan-tasks__card--dragging {
  opacity: 0.6;
  cursor: grabbing;
}

.flight-plan-tasks__card--drop-before {
  border-top-color: var(--color-border-focus);
  border-top-width: var(--flight-plan-drop-indicator-width);
}

.flight-plan-tasks__card--drop-after {
  border-bottom-color: var(--color-border-focus);
  border-bottom-width: var(--flight-plan-drop-indicator-width);
}

.flight-plan-tasks__empty {
  padding: var(--space-xs) 0;
}

.flight-plan-tasks__owner {
  font-size: var(--flight-plan-font-owner-size);
  color: var(--color-text-muted);
}

.flight-plan-tasks__description {
  font-size: var(--flight-plan-font-description-size);
  color: var(--color-text-secondary);
}

.flight-plan-tasks__resources {
  display: grid;
  gap: var(--space-md);
}

.flight-plan-tasks__resource {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.flight-plan-tasks__resource-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.flight-plan-tasks__resource-item {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-xs);
}

.flight-plan-tasks__resource-link {
  color: var(--color-text-primary);
  text-decoration: underline;
}

.flight-plan-tasks__resource-meta {
  font-size: var(--flight-plan-font-resource-meta-size);
  color: var(--color-text-meta);
}

.flight-plan-tasks__resource-empty {
  color: var(--color-text-meta);
}

.flight-plan-tasks__link-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.flight-plan-tasks__quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
}

.flight-plan-tasks__claim-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
}

.flight-plan-tasks__assignees {
  display: flex;
  flex-direction: column;
  gap: var(--flight-plan-assignee-gap);
}

.flight-plan-tasks__assignee-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2xs);
}

.flight-plan-tasks__assignee-chip {
  align-items: center;
  gap: var(--flight-plan-assignee-gap);
  font-size: calc(
    var(--flight-plan-assignee-avatar-size)
    * var(--size-ratio-badge-to-avatar-chip)
  );
}

.flight-plan-tasks__assignee-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--flight-plan-assignee-avatar-size);
  height: var(--flight-plan-assignee-avatar-size);
  border-radius: var(--radius-pill);
  background: var(--color-surface-base);
  overflow: hidden;
}

.flight-plan-tasks__assignee-renderer,
.flight-plan-tasks__assignee-renderer :deep(.avatar-media),
.flight-plan-tasks__assignee-renderer :deep(.avatar-media__image),
.flight-plan-tasks__assignee-renderer :deep(.avatar-media__video),
.flight-plan-tasks__assignee-renderer :deep(.avatar-media__model),
.flight-plan-tasks__assignee-renderer :deep(.avatar-media__model-link--compact) {
  width: 100%;
  height: 100%;
  display: block;
}

.flight-plan-tasks__assignee-renderer :deep(.avatar-media__image),
.flight-plan-tasks__assignee-renderer :deep(.avatar-media__video),
.flight-plan-tasks__assignee-renderer :deep(.avatar-media__model) {
  object-fit: cover;
}

.flight-plan-tasks__discussion {
  margin-top: var(--space-xs);
  border-top: var(--flight-plan-border-width) solid var(--color-border-weak);
  padding-top: var(--space-xs);
}

.flight-plan-tasks__discussion-toggle {
  margin-top: var(--space-2xs);
}

@keyframes flight-plan-task-shimmer {
  0% {
    background-position: calc(var(--flight-plan-shimmer-offset) * -1) 0;
  }
  100% {
    background-position: var(--flight-plan-shimmer-offset) 0;
  }
}
</style>
