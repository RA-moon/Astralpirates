<template>
  <div class="ui-empty-state">
    <div class="ui-empty-state__icon">
      <slot name="icon">🛰️</slot>
    </div>
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <div class="ui-empty-state__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description: string;
}>();
</script>

<style scoped>
.ui-empty-state {
  border: var(--size-base-layout-px) dashed var(--color-border-weak);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  color: var(--color-text-secondary);
}

.ui-empty-state__icon {
  font-size: var(--space-xl);
}

.ui-empty-state__actions {
  display: inline-flex;
  gap: var(--space-sm);
  justify-content: center;
}
</style>
