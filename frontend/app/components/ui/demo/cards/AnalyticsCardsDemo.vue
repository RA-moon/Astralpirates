<template>
  <section class="ui-demo-panel" data-testid="stat-card-demo">
    <UiStack :gap="'var(--space-lg)'">
      <div>
        <UiHeading :level="3" size="h4" :uppercase="false">Analytics cards</UiHeading>
        <UiText variant="muted">
          Stat + metric cards mirror the live bridge dashboards for quick telemetry previews.
        </UiText>
      </div>

      <div class="ui-demo-stat-grid">
        <UiStatCard v-for="stat in statCards" :key="stat.label" v-bind="stat" />
      </div>

      <div class="ui-demo-metric-grid">
        <UiMetricCard v-for="metric in metricCards" :key="metric.label" v-bind="metric">
          <template #icon>
            <UiStatusDot :variant="trendToVariant(metric.trend?.type)">
              {{ metric.trend?.type ?? 'neutral' }}
            </UiStatusDot>
          </template>
        </UiMetricCard>
      </div>

      <div class="ui-demo-dot-row">
        <UiStatusDot v-for="state in statusStates" :key="state.label" :variant="state.variant">
          {{ state.label }}
        </UiStatusDot>
      </div>
    </UiStack>
  </section>
</template>

<script setup lang="ts">
import {
  UiHeading,
  UiMetricCard,
  UiStack,
  UiStatCard,
  UiStatusDot,
  UiText,
} from '~/components/ui';
import { sampleMetricCards, sampleStatCards } from '~/components/ui/demo/sampleData';

const statCards = sampleStatCards;
const metricCards = sampleMetricCards;
const statusStates = [
  { label: 'Nominal', variant: 'success' },
  { label: 'Standby', variant: 'warning' },
  { label: 'Issue detected', variant: 'danger' },
] as const;

const trendToVariant = (type?: 'up' | 'down' | 'neutral') => {
  if (type === 'up') return 'success';
  if (type === 'down') return 'danger';
  return 'default';
};
</script>

<style scoped>
.ui-demo-panel {
  padding: var(--space-lg);
  border: 1px solid var(--color-border-panel);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.03);
}

.ui-demo-stat-grid,
.ui-demo-metric-grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.ui-demo-metric-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.ui-demo-dot-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}
</style>
