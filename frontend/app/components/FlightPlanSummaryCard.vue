<template>
  <UiSurface class="flight-plan-summary-card" variant="panel">
    <NuxtLink :to="href" class="flight-plan-summary-card__body">
      <UiText variant="eyebrow">{{ missionCode }}</UiText>
      <UiHeading :level="3" size="h4" :uppercase="false">
        {{ plan.title }}
      </UiHeading>
      <UiInline :gap="'var(--space-xs)'" class="flight-plan-summary-card__tags">
        <UiTag size="sm" variant="muted">{{ categoryLabel }}</UiTag>
        <UiTag size="sm">{{ statusLabel }}</UiTag>
        <UiTag size="sm" variant="muted">{{ bucketLabel }}</UiTag>
      </UiInline>
      <UiText v-if="metaText" variant="muted" class="flight-plan-summary-card__meta">
        {{ metaText }}
      </UiText>
      <UiText v-if="summaryText" class="flight-plan-summary-card__summary">
        {{ summaryText }}
      </UiText>
    </NuxtLink>

    <div class="flight-plan-summary-card__footer">
      <CrewAvatarStack v-if="crewMembers.length" :crew="crewMembers" size="sm" />
      <UiLinkButton :to="href" variant="secondary" size="sm">
        Open plan
      </UiLinkButton>
    </div>
  </UiSurface>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CrewAvatarStack from '~/components/CrewAvatarStack.vue';
import type { FlightPlanSummary } from '~/modules/api/schemas';
import { getFlightPlanBucketLabel, getFlightPlanStatusLabel } from '~/domains/flightPlans';
import { UiHeading, UiInline, UiLinkButton, UiSurface, UiTag, UiText } from '~/components/ui';

const props = defineProps<{
  plan: FlightPlanSummary;
}>();

const href = computed(() => {
  const target = props.plan.href?.trim();
  if (!target) return '#';
  return target.startsWith('/') ? target : `/${target.replace(/^\/+/, '')}`;
});

const metaText = computed(() => {
  const parts: string[] = [];
  if (props.plan.displayDate) parts.push(props.plan.displayDate);
  if (props.plan.location) parts.push(props.plan.location);
  return parts.join(' • ');
});

const summaryText = computed(() => props.plan.summary?.trim() ?? '');

const missionCode = computed(() => {
  if (props.plan.dateCode) return `Mission ${props.plan.dateCode}`;
  if (props.plan.displayDate) return props.plan.displayDate;
  return 'Mission briefing';
});

const crewMembers = computed(() => {
  if (Array.isArray(props.plan.crewPreview) && props.plan.crewPreview.length > 0) {
    return props.plan.crewPreview.slice(0, 5);
  }
  return props.plan.owner ? [props.plan.owner] : [];
});

const categoryLabel = computed(() => {
  const category = (props.plan as any)?.category;
  if (category === 'test') return 'Test';
  if (category === 'event') return 'Event';
  return 'Project';
});

const statusLabel = computed(() => getFlightPlanStatusLabel(props.plan.status));
const bucketLabel = computed(() => getFlightPlanBucketLabel(props.plan.status));

</script>

<style scoped>
.flight-plan-summary-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.flight-plan-summary-card__body {
  text-decoration: none;
  color: inherit;
  display: flex;
  flex-direction: column;
  gap: calc(var(--size-base-space-rem) * 0.4 * var(--size-scale-factor));
}

.flight-plan-summary-card__summary {
  margin: 0;
  color: var(--color-text-secondary);
}

.flight-plan-summary-card__tags {
  flex-wrap: wrap;
}

.flight-plan-summary-card__meta {
  margin: 0;
}

.flight-plan-summary-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
}
</style>
