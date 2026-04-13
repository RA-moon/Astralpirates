<template>
  <UiStack class="log-list" :gap="'var(--space-lg)'">
    <div class="log-list__header" v-if="title || showCreate">
      <UiHeading v-if="title" :level="2">{{ title }}</UiHeading>
      <UiButton
        v-if="showCreate"
        variant="secondary"
        size="sm"
        type="button"
        @click="composerVisible ? closeComposer() : openComposer()"
      >
        {{ composerVisible ? 'Close composer' : 'New log entry' }}
      </UiButton>
    </div>

    <PaginatedList
      :items="logs"
      :pending="pending"
      :error-message="errorMessage"
      :empty-label="emptyLabel"
      loading-label="Loading logbook…"
      :show-more="showMore"
      @load-more="loadMore"
    >
      <template #default="{ item }">
        <LogSummaryCard :log="item" :mission="missionFor(item)" />
      </template>
    </PaginatedList>

    <UiSurface v-if="composerVisible" class="log-list__composer" variant="panel">
      <form @submit.prevent="submitLog">
        <UiStack :gap="'var(--space-md)'">
          <UiFormField label="Title" :required="true" :error="composerTitleError">
            <template #default="{ id, describedBy }">
              <UiTextInput
                v-model="composer.title"
                :id="id"
                :described-by="describedBy"
                maxlength="50"
                placeholder="Enter a short headline"
              />
            </template>
          </UiFormField>

          <UiFormField label="Log entry" :required="true">
            <template #default="{ id, describedBy }">
              <UiTextArea
                v-model="composer.body"
                :id="id"
                :described-by="describedBy"
                rows="5"
                placeholder="Share what just happened…"
              />
            </template>
          </UiFormField>

          <UiFormField label="Associate flight plan">
            <template #default="{ id, describedBy }">
              <UiSelect
                v-model="composer.flightPlanId"
                :id="id"
                :described-by="describedBy"
                :options="flightPlanSelectOptions"
                :disabled="crewFlightPlansLoading"
              />
            </template>
          </UiFormField>

          <UiText v-if="crewFlightPlansLoading" variant="muted">
            Loading available flight plans…
          </UiText>
          <UiAlert
            v-else-if="crewFlightPlansError"
            variant="danger"
            layout="inline"
          >
            {{ crewFlightPlansError }}
          </UiAlert>
          <UiAlert
            v-else-if="crewFlightPlansLoaded && !hasCrewFlightPlans"
            variant="info"
            layout="inline"
          >
            You are not crew on any flight plans yet. Logs will be saved without a mission link.
          </UiAlert>

          <UiInline class="log-list__composer-actions" :gap="'var(--space-sm)'">
            <UiButton type="button" variant="ghost" @click="closeComposer">
              Cancel
            </UiButton>
            <UiButton type="submit" :loading="composerSubmitting">
              Publish log
            </UiButton>
          </UiInline>

          <UiAlert
            v-if="composerFeedback"
            :variant="composerFeedbackIsError ? 'danger' : 'success'"
            layout="inline"
          >
            {{ composerFeedback }}
          </UiAlert>
        </UiStack>
      </form>
    </UiSurface>
  </UiStack>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  useLogbook,
  createLogEntry,
  fetchCrewFlightPlans,
  type CrewFlightPlanMembership,
} from '~/domains/logs';
import { useSessionStore } from '~/stores/session';
import type { LogSummary } from '~/modules/api/schemas';
import LogSummaryCard from '~/components/LogSummaryCard.vue';
import { ensureMissionSummaries, type MissionSummary } from '~/utils/logs';
import { reportClientEvent } from '~/utils/errorReporter';
import { useDebounceFn } from '@vueuse/core';
import {
  UiAlert,
  UiButton,
  UiFormField,
  UiHeading,
  UiInline,
  UiSelect,
  UiStack,
  UiSurface,
  UiText,
  UiTextArea,
  UiTextInput,
} from '~/components/ui';

const props = withDefaults(
  defineProps<{
    ownerSlug?: string | null;
    title?: string;
    limit?: number;
    emptyLabel?: string;
    showComposer?: boolean;
    minRole?: string | null;
    allowCreate?: boolean;
    roles?: string[] | null;
    owners?: string[] | null;
  }>(),
  {
    ownerSlug: null,
    title: '',
    limit: 5,
    emptyLabel: 'No logs available yet.',
    showComposer: false,
    minRole: null,
    allowCreate: false,
    roles: () => [],
    owners: () => [],
  },
);

const limit = ref(props.limit);
const limitStep = computed(() => props.limit);

const { data, pending, error, refresh } = useLogbook({
  ownerSlug: () => props.ownerSlug,
  limit,
  minRole: () => props.minRole ?? null,
  roles: () => props.roles ?? [],
  owners: () => props.owners ?? [],
});

watch(
  () => props.limit,
  (next) => {
    limit.value = next;
  },
);

const session = useSessionStore();
const logs = computed<LogSummary[]>(() => data.value?.logs ?? []);
const total = computed(() => data.value?.total ?? logs.value.length);
const showMore = computed(() => logs.value.length < total.value);
const errorMessage = computed(() => error.value?.data?.error ?? error.value?.message ?? '');
const emptyLabel = computed(() => props.emptyLabel);

const showCreate = computed(() => props.showComposer && props.allowCreate && session.isAuthenticated);

const composerVisible = ref(false);
const composerSubmitting = ref(false);
const composerFeedback = ref('');
const composerFeedbackIsError = ref(false);
const composerTitleError = ref('');
const composer = reactive({
  title: '',
  body: '',
  flightPlanId: '',
});

const crewFlightPlans = ref<CrewFlightPlanMembership[]>([]);
const crewFlightPlansLoaded = ref(false);
const crewFlightPlansLoading = ref(false);
const crewFlightPlansError = ref('');

const crewFlightPlanOptions = computed(() =>
  crewFlightPlans.value.filter((membership) => Number.isFinite(membership.flightPlanId)),
);
const hasCrewFlightPlans = computed(() => crewFlightPlanOptions.value.length > 0);
const flightPlanSelectOptions = computed(() => [
  { label: 'No flight plan', value: '' },
  ...crewFlightPlanOptions.value.map((membership) => ({
    label: membership.flightPlan?.title ?? `Flight plan #${membership.flightPlanId}`,
    value: String(membership.flightPlanId ?? ''),
  })),
]);

const missionSummaries = ref<Map<number, MissionSummary | null>>(new Map());
let latestMissionRequest = 0;

const requestMissionSummaries = useDebounceFn((ids: number[]) => {
  const requestId = ++latestMissionRequest;
  ensureMissionSummaries(ids)
    .then((map) => {
      if (requestId === latestMissionRequest) {
        missionSummaries.value = map;
      }
    })
    .catch((missionError) => {
      reportClientEvent({
        component: 'LogList',
        message: 'Failed to fetch mission summaries',
        error: missionError,
        meta: { ids },
        level: 'warn',
      });
    });
}, 50);

watch(
  logs,
  (entries) => {
    const ids = entries
      .map((entry) => (typeof entry.flightPlanId === 'number' ? entry.flightPlanId : null))
      .filter((id): id is number => id !== null);

    if (ids.length === 0) {
      missionSummaries.value = new Map();
      return;
    }

    requestMissionSummaries(ids);
  },
  { immediate: true },
);

const missionFor = (log: LogSummary) => {
  if (typeof log.flightPlanId !== 'number') return null;
  return missionSummaries.value.get(log.flightPlanId) ?? null;
};

const insertLog = (created: LogSummary) => {
  const current = Array.isArray(data.value?.logs) ? data.value.logs : [];
  const withoutDuplicate = current.filter((entry) => entry.id !== created.id && entry.slug !== created.slug);
  const nextLogs = [created, ...withoutDuplicate];
  const nextTotal = Math.max((data.value?.total ?? withoutDuplicate.length) + 1, nextLogs.length);
  data.value = {
    ...(data.value ?? { logs: [], total: 0 }),
    logs: nextLogs.slice(0, limit.value),
    total: nextTotal,
  };
};

const loadCrewFlightPlans = async () => {
  if (!session.isAuthenticated || crewFlightPlansLoaded.value || crewFlightPlansLoading.value) {
    return;
  }

  crewFlightPlansLoading.value = true;
  crewFlightPlansError.value = '';
  try {
    const memberships = await fetchCrewFlightPlans();
    crewFlightPlans.value = memberships;
    crewFlightPlansLoaded.value = true;
  } catch (error: any) {
    crewFlightPlansError.value =
      error?.statusMessage || error?.data?.error || error?.message || 'Unable to load flight plans.';
  } finally {
    crewFlightPlansLoading.value = false;
  }
};

const openComposer = () => {
  composerVisible.value = true;
  composer.title = '';
  composer.body = '';
  composer.flightPlanId = '';
  composerFeedback.value = '';
  composerFeedbackIsError.value = false;
  composerTitleError.value = '';
  if (!crewFlightPlansLoaded.value && !crewFlightPlansLoading.value) {
    void loadCrewFlightPlans();
  }
};

const closeComposer = () => {
  composerVisible.value = false;
  composer.title = '';
  composer.body = '';
  composer.flightPlanId = '';
  composerFeedback.value = '';
  composerFeedbackIsError.value = false;
  composerTitleError.value = '';
};

const submitLog = async () => {
  composerFeedback.value = '';
  composerFeedbackIsError.value = false;
  composerTitleError.value = '';
  const trimmedTitle = composer.title.trim();
  if (!trimmedTitle) {
    composerTitleError.value = 'Title is required.';
    return;
  }
  if (trimmedTitle.length > 50) {
    composerTitleError.value = 'Title must be 50 characters or fewer.';
    return;
  }
  if (!composer.body.trim()) {
    composerFeedback.value = 'Log body cannot be empty.';
     composerFeedbackIsError.value = true;
    return;
  }
  composerSubmitting.value = true;
  composerFeedback.value = '';
  try {
    const selectedFlightPlanId = composer.flightPlanId ? Number(composer.flightPlanId) : null;
    const response = await createLogEntry({
      title: trimmedTitle,
      body: composer.body.trim(),
      flightPlanId: selectedFlightPlanId ?? undefined,
    });
    if (response?.log) {
      insertLog(response.log);
    }
    closeComposer();
    void refresh();
  } catch (err: any) {
    composerFeedback.value =
      err?.statusMessage || err?.data?.error || err?.message || 'Failed to publish log.';
    composerFeedbackIsError.value = true;
  } finally {
    composerSubmitting.value = false;
  }
};

const loadMore = () => {
  limit.value += limitStep.value;
};

watch(
  () => session.isAuthenticated,
  (authenticated) => {
    if (!authenticated) {
      crewFlightPlans.value = [];
      crewFlightPlansLoaded.value = false;
      crewFlightPlansError.value = '';
    }
  },
);
</script>

<style scoped>
.log-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.log-list__composer {
  padding: var(--space-lg);
}

.log-list__composer-actions {
  justify-content: flex-end;
  flex-wrap: wrap;
}
</style>
