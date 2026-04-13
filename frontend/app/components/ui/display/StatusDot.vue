<template>
  <span class="ui-status-dot" :class="`ui-status-dot--${variant}`">
    <span class="ui-status-dot__indicator"></span>
    <slot />
  </span>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'default' | 'success' | 'warning' | 'danger';
  }>(),
  {
    variant: 'default',
  },
);
</script>

<style scoped>
.ui-status-dot {
  --ui-status-dot-gap: var(--crew-identity-gap);
  --ui-status-dot-font-size: calc(var(--size-base-space-rem) * 0.9 * var(--size-scale-factor));

  display: inline-flex;
  align-items: center;
  gap: var(--ui-status-dot-gap);
  font-size: var(--ui-status-dot-font-size);
}

.ui-status-dot__indicator {
  --ui-status-dot-indicator-size: calc(var(--size-base-space-rem) * 0.6 * var(--size-scale-factor));

  width: var(--ui-status-dot-indicator-size);
  height: var(--ui-status-dot-indicator-size);
  border-radius: 50%;
  background: var(--color-text-secondary);
}

.ui-status-dot--success .ui-status-dot__indicator {
  background: var(--color-success);
}

.ui-status-dot--warning .ui-status-dot__indicator {
  background: var(--color-warning);
}

.ui-status-dot--danger .ui-status-dot__indicator {
  background: var(--color-danger);
}
</style>
