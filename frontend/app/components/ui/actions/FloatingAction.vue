<template>
  <button
    type="button"
    class="ui-floating-action"
    :class="[`ui-floating-action--${position}`]"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    position?: 'bottom-right' | 'bottom-left';
  }>(),
  {
    position: 'bottom-right',
  },
);
</script>

<style scoped>
.ui-floating-action {
  --ui-floating-action-border-width: var(--size-base-layout-px);
  --ui-floating-action-padding-y: calc(var(--size-base-space-rem) * 0.8 * var(--size-scale-factor));
  --ui-floating-action-padding-x: calc(var(--size-base-space-rem) * 1.4 * var(--size-scale-factor));

  position: fixed;
  bottom: var(--space-lg);
  right: var(--space-lg);
  border-radius: var(--radius-pill);
  border: var(--ui-floating-action-border-width) solid var(--color-button-border);
  background: var(--gradient-button-default);
  color: var(--color-text-primary);
  padding: var(--ui-floating-action-padding-y) var(--ui-floating-action-padding-x);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  cursor: pointer;
  box-shadow: var(--shadow-overlay);
}

.ui-floating-action--bottom-left {
  right: auto;
  left: var(--space-lg);
}
</style>
