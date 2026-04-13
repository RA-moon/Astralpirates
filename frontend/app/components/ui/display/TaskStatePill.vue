<template>
  <span class="ui-task-state-pill" :data-state="state">
    <span class="ui-task-state-pill__icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" role="img" focusable="false">
        <g v-if="icon === 'spark'">
          <path
            d="M16 4l2.85 7.15L26 14l-7.15 2.85L16 24l-2.85-7.15L6 14l7.15-2.85z"
            fill="currentColor"
            fill-opacity="0.92"
          />
        </g>
        <g v-else-if="icon === 'compass'">
          <circle cx="16" cy="16" r="10" stroke="currentColor" stroke-width="2" fill="none" />
          <path d="M16 7v18M7 16h18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </g>
        <g v-else-if="icon === 'flag'">
          <path
            d="M9 6v20"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
          <path
            d="M11 7h12l-3 5 3 5H11z"
            fill="currentColor"
            fill-opacity="0.9"
          />
        </g>
        <g v-else-if="icon === 'thrusters'">
          <path
            d="M12 6h8l4 8-4 8h-8l-4-8z"
            fill="currentColor"
            fill-opacity="0.85"
          />
          <path
            d="M14 24l2 6 2-6"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>
        <g v-else-if="icon === 'scan'">
          <rect
            x="8"
            y="8"
            width="16"
            height="16"
            rx="4"
            ry="4"
            stroke="currentColor"
            stroke-width="1.5"
            fill="none"
          />
          <circle cx="16" cy="16" r="3" fill="currentColor" />
          <path
            d="M16 10v-2M16 24v-2M10 16h-2M24 16h-2"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </g>
        <g v-else-if="icon === 'check'">
          <path
            d="M9 17l4 4 10-10"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>
        <g v-else>
          <circle cx="16" cy="12" r="4" fill="currentColor" />
          <path
            d="M16 18v8"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
          <path
            d="M10 26h12"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
          <path
            d="M7 10l3 2M25 10l-3 2"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </g>
      </svg>
    </span>
    <span class="ui-task-state-pill__label">{{ meta.label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getFlightPlanTaskStateMeta, type FlightPlanTaskState } from '~/modules/api/schemas';

const props = defineProps<{
  state: FlightPlanTaskState;
}>();

const meta = computed(() => getFlightPlanTaskStateMeta(props.state));
const icon = computed(() => meta.value.icon);
</script>

<style scoped>
.ui-task-state-pill {
  --ui-task-state-pill-padding-block: var(--space-3xs);
  --ui-task-state-pill-padding-inline: calc(var(--size-base-space-rem) * 0.6);
  --ui-task-state-pill-font-size: var(--space-sm);
  --ui-task-state-pill-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 0.5);
  --ui-task-state-pill-border-width: var(--size-base-layout-px);
  --ui-task-state-pill-icon-size: var(--size-base-space-rem);

  display: inline-flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: var(--ui-task-state-pill-padding-block) var(--ui-task-state-pill-padding-inline);
  border-radius: var(--radius-pill);
  font-size: var(--ui-task-state-pill-font-size);
  letter-spacing: var(--ui-task-state-pill-letter-spacing);
  text-transform: uppercase;
  border: var(--ui-task-state-pill-border-width) solid var(--task-pill-color, var(--color-border-weak));
  background-color: color-mix(in srgb, var(--task-pill-color, var(--color-border-weak)) 20%, transparent);
  color: var(--task-pill-color, var(--color-text-primary));
}

.ui-task-state-pill__icon {
  width: var(--ui-task-state-pill-icon-size);
  height: var(--ui-task-state-pill-icon-size);
  display: inline-flex;
}

.ui-task-state-pill__icon svg {
  width: 100%;
  height: 100%;
}

.ui-task-state-pill[data-state='ideation'] {
  --task-pill-color: var(--color-task-ideation);
}

.ui-task-state-pill[data-state='grooming'] {
  --task-pill-color: var(--color-task-grooming);
}

.ui-task-state-pill[data-state='ready'] {
  --task-pill-color: var(--color-task-ready);
}

.ui-task-state-pill[data-state='in-progress'] {
  --task-pill-color: var(--color-task-in-progress);
}

.ui-task-state-pill[data-state='review'] {
  --task-pill-color: var(--color-task-review);
}

.ui-task-state-pill[data-state='done'] {
  --task-pill-color: var(--color-task-done);
}

.ui-task-state-pill[data-state='live'] {
  --task-pill-color: var(--color-task-live);
}
</style>
