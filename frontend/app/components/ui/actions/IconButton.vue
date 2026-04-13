<template>
  <button
    type="button"
    class="ui-icon-button"
    :class="[`ui-icon-button--${variant}`, `ui-icon-button--${size}`]"
    :disabled="disabled"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost';
    size?: 'md' | 'sm';
    disabled?: boolean;
  }>(),
  {
    variant: 'primary',
    size: 'md',
    disabled: false,
  },
);
</script>

<style scoped>
.ui-icon-button {
  --ui-icon-button-border-width: var(--size-base-layout-px);
  --ui-icon-button-size-md: calc(var(--size-base-space-rem) * 2.5 * var(--size-scale-factor));
  --ui-icon-button-size-sm: var(--space-xl);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: var(--ui-icon-button-border-width) solid transparent;
  cursor: pointer;
  color: var(--color-text-primary);
  background: transparent;
}

.ui-icon-button--md {
  width: var(--ui-icon-button-size-md);
  height: var(--ui-icon-button-size-md);
}

.ui-icon-button--sm {
  width: var(--ui-icon-button-size-sm);
  height: var(--ui-icon-button-size-sm);
}

.ui-icon-button--primary {
  border-color: var(--color-button-border);
  background: var(--gradient-button-default);
}

.ui-icon-button--ghost {
  border-color: var(--color-border-weak);
  background: transparent;
}

.ui-icon-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
