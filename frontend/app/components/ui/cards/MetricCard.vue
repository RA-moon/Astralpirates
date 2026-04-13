<template>
  <article class="ui-metric-card">
    <header class="ui-metric-card__header">
      <span class="ui-metric-card__label">{{ label }}</span>
      <slot name="icon" />
    </header>
    <strong class="ui-metric-card__value">{{ value }}</strong>
    <p v-if="trend" class="ui-metric-card__trend" :class="`ui-metric-card__trend--${trend.type}`">
      {{ trend.text }}
    </p>
    <p v-if="description" class="ui-metric-card__description">{{ description }}</p>
  </article>
</template>

<script setup lang="ts">
type Trend = {
  type: 'up' | 'down' | 'neutral';
  text: string;
};

defineProps<{
  label: string;
  value: string | number;
  trend?: Trend;
  description?: string;
}>();
</script>

<style scoped>
.ui-metric-card {
  --ui-metric-card-border-width: var(--size-base-layout-px);
  --ui-metric-card-gap: var(--crew-identity-gap);
  --ui-metric-card-min-width: calc(var(--size-avatar-hero) * 1.6667);
  --ui-metric-card-label-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 1.5);
  --ui-metric-card-label-font-size: var(--space-sm);
  --ui-metric-card-value-font-size: calc(var(--size-base-space-rem) * 2.4);
  --ui-metric-card-trend-font-size: calc(var(--size-base-space-rem) * 0.9);

  border: var(--ui-metric-card-border-width) solid var(--color-data-gridline);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  background: var(--color-data-surface);
  display: flex;
  flex-direction: column;
  gap: var(--ui-metric-card-gap);
  min-width: var(--ui-metric-card-min-width);
}

.ui-metric-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ui-metric-card__label {
  text-transform: uppercase;
  letter-spacing: var(--ui-metric-card-label-letter-spacing);
  font-size: var(--ui-metric-card-label-font-size);
  color: var(--color-data-neutral);
}

.ui-metric-card__value {
  font-size: var(--ui-metric-card-value-font-size);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.ui-metric-card__trend {
  margin: 0;
  font-size: var(--ui-metric-card-trend-font-size);
}

.ui-metric-card__trend--up {
  color: var(--color-success);
}

.ui-metric-card__trend--down {
  color: var(--color-danger);
}

.ui-metric-card__trend--neutral {
  color: var(--color-data-neutral);
}

.ui-metric-card__description {
  margin: 0;
  color: var(--color-data-neutral);
}
</style>
