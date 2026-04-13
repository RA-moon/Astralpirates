<template>
  <UiStack :gap="'var(--space-sm)'">
    <UiHeading :level="3" size="h4" :uppercase="false">Task state pills</UiHeading>
    <UiText variant="muted">
      Shared mission-task states sourced from <code>shared/taskStates.ts</code> so UI and API stay aligned.
    </UiText>

    <UiInline class="ui-task-pill-grid" :gap="'var(--space-sm)'" :wrap="true">
      <UiTaskStatePill v-for="state in states" :key="state" :state="state" />
    </UiInline>
  </UiStack>
</template>

<script setup lang="ts">
import { FLIGHT_PLAN_TASK_STATES, type FlightPlanTaskState } from '@astralpirates/shared/taskStates';
import { UiHeading, UiInline, UiStack, UiTaskStatePill, UiText } from '~/components/ui';

const states: FlightPlanTaskState[] = [...FLIGHT_PLAN_TASK_STATES];
</script>

<style scoped>
.ui-task-pill-grid {
  max-width: 560px;
}
</style>
