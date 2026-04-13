<template>
<UiStack class="flight-plan-list u-stack u-stack--section" :gap="undefined">
    <UiHeading v-if="title" :level="2">{{ title }}</UiHeading>
    <UiInline class="flight-plan-list__filters" :gap="'var(--space-sm)'">
      <UiSelect
        v-model="categoryFilter"
        class="flight-plan-list__filter"
        :options="categoryOptions"
      />
      <UiSelect
        v-model="bucketFilter"
        class="flight-plan-list__filter"
        :options="bucketOptions"
      />
      <UiSelect
        v-model="statusFilter"
        class="flight-plan-list__filter"
        :options="statusOptions"
      />
    </UiInline>

    <PaginatedList
      :items="displayPlans"
      :pending="pending"
      :error-message="errorMessage"
      :empty-label="emptyLabel"
      loading-label="Scanning star maps…"
      :show-more="showMore"
      @load-more="loadMore"
    >
      <template #default="{ item }">
        <FlightPlanSummaryCard :plan="item" />
      </template>
    </PaginatedList>
  </UiStack>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useFlightPlans } from '~/domains/logs';
import type { FlightPlanSummary } from '~/modules/api/schemas';
import { resolveFlightPlanHref } from '~/utils/flightPlans';
import FlightPlanSummaryCard from '~/components/FlightPlanSummaryCard.vue';
import {
  FLIGHT_PLAN_STATUS_LABELS,
  FLIGHT_PLAN_BUCKET_LABELS,
} from '~/domains/flightPlans';
import { UiHeading, UiInline, UiSelect, UiStack } from '~/components/ui';

const props = withDefaults(
  defineProps<{
    ownerSlug?: string | null;
    memberSlug?: string | null;
    title?: string;
    limit?: number;
    emptyLabel?: string;
    minRole?: string | null;
  }>(),
  {
    ownerSlug: null,
    memberSlug: null,
    title: '',
    limit: 5,
    emptyLabel: 'No flight plans available yet.',
    minRole: null,
  },
);

const limit = ref(props.limit);
const limitStep = computed(() => props.limit);
const categoryFilter = ref('all');
const categoryOptions = [
  { label: 'All categories', value: 'all' },
  { label: 'Project', value: 'project' },
  { label: 'Event', value: 'event' },
  { label: 'Test', value: 'test' },
];
const categoryFilters = computed(() =>
  categoryFilter.value === 'all' ? [] : [categoryFilter.value],
);
const bucketFilter = ref('all');
const bucketOptions = [
  { label: 'All buckets', value: 'all' },
  { label: FLIGHT_PLAN_BUCKET_LABELS.active, value: 'active' },
  { label: FLIGHT_PLAN_BUCKET_LABELS.finished, value: 'finished' },
  { label: FLIGHT_PLAN_BUCKET_LABELS.archived, value: 'archived' },
];
const bucket = computed(() =>
  bucketFilter.value === 'all'
    ? null
    : (bucketFilter.value as 'active' | 'finished' | 'archived'),
);
const statusFilter = ref('all');
const statusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: FLIGHT_PLAN_STATUS_LABELS.planned, value: 'planned' },
  { label: FLIGHT_PLAN_STATUS_LABELS.pending, value: 'pending' },
  { label: FLIGHT_PLAN_STATUS_LABELS.ongoing, value: 'ongoing' },
  { label: FLIGHT_PLAN_STATUS_LABELS['on-hold'], value: 'on-hold' },
  { label: FLIGHT_PLAN_STATUS_LABELS.postponed, value: 'postponed' },
  { label: FLIGHT_PLAN_STATUS_LABELS.success, value: 'success' },
  { label: FLIGHT_PLAN_STATUS_LABELS.failure, value: 'failure' },
  { label: FLIGHT_PLAN_STATUS_LABELS.aborted, value: 'aborted' },
  { label: FLIGHT_PLAN_STATUS_LABELS.cancelled, value: 'cancelled' },
];
const statusFilters = computed(() =>
  statusFilter.value === 'all' ? [] : [statusFilter.value],
);

const { data, pending, error, refresh } = useFlightPlans({
  ownerSlug: () => props.ownerSlug,
  memberSlug: () => props.memberSlug,
  limit,
  minRole: () => props.minRole ?? null,
  categories: categoryFilters,
  statuses: statusFilters,
  bucket,
});

watch(
  () => props.limit,
  (next) => {
    limit.value = next;
  },
);

const plans = computed<FlightPlanSummary[]>(() => data.value?.plans ?? []);
const displayPlans = computed<FlightPlanSummary[]>(() =>
  plans.value.map((plan) => ({
    ...plan,
    href: resolveFlightPlanHref(plan),
    crewPreview: Array.isArray(plan.crewPreview) ? plan.crewPreview : [],
  })),
);
const total = computed(() => data.value?.total ?? displayPlans.value.length);
const showMore = computed(() => displayPlans.value.length < total.value);
const errorMessage = computed(() => error.value?.data?.error ?? error.value?.message ?? '');
const emptyLabel = computed(() => props.emptyLabel);

const loadMore = () => {
  limit.value += limitStep.value;
};

const title = computed(() => props.title);

defineExpose({ refresh });
</script>

<style scoped>
.flight-plan-list {
  width: 100%;
}

.flight-plan-list__filter {
  max-width: calc(var(--size-base-layout-px) * 220 * var(--size-scale-factor));
}

.flight-plan-list__filters {
  flex-wrap: wrap;
}
</style>
