<template>
  <article class="ui-stat-card">
    <span class="ui-stat-card__label">{{ label }}</span>
    <strong class="ui-stat-card__value">{{ value }}</strong>
    <p v-if="meta" class="ui-stat-card__meta">{{ meta }}</p>
  </article>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
  value: string | number;
  meta?: string;
}>();
</script>

<style scoped>
.ui-stat-card {
  --ui-stat-card-border-width: var(--size-base-layout-px);
  --ui-stat-card-gap: var(--crew-identity-gap);
  --ui-stat-card-min-width: calc(var(--size-avatar-hero) * 1.3636);
  --ui-stat-card-label-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 1.5);
  --ui-stat-card-label-font-size: var(--space-sm);
  --ui-stat-card-value-font-size: var(--space-xl);
  --ui-stat-card-meta-font-size: calc(var(--size-base-space-rem) * 0.9);

  border: var(--ui-stat-card-border-width) solid var(--color-data-gridline);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  background: var(--color-data-surface);
  display: flex;
  flex-direction: column;
  gap: var(--ui-stat-card-gap);
  min-width: var(--ui-stat-card-min-width);
}

.ui-stat-card__label {
  text-transform: uppercase;
  letter-spacing: var(--ui-stat-card-label-letter-spacing);
  font-size: var(--ui-stat-card-label-font-size);
  color: var(--color-data-neutral);
}

.ui-stat-card__value {
  font-size: var(--ui-stat-card-value-font-size);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.ui-stat-card__meta {
  margin: 0;
  font-size: var(--ui-stat-card-meta-font-size);
  color: var(--color-data-neutral);
}
</style>
