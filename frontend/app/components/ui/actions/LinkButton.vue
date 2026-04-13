<template>
  <component
    :is="componentTag"
    class="ui-link-button"
    :class="[`ui-link-button--${variant}`, `ui-link-button--${size}`]"
    v-bind="$attrs"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed, resolveComponent, type Component } from 'vue';

const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'md' | 'sm';
    as?: string | Component;
  }>(),
  {
    variant: 'primary',
    size: 'md',
    as: undefined,
  },
);

const componentTag = computed<Component | string>(() => {
  if (props.as) return props.as;
  const resolved = resolveComponent('NuxtLink', false);
  return resolved ?? 'NuxtLink';
});
</script>

<style scoped>
.ui-link-button {
  --ui-link-button-gap: calc(var(--size-base-space-rem) * 0.4);
  --ui-link-button-border-width: var(--size-base-layout-px);
  --ui-link-button-padding-block: calc(var(--size-base-space-rem) * 0.6);
  --ui-link-button-padding-inline: calc(var(--size-base-space-rem) * 1.4);
  --ui-link-button-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --ui-link-button-sm-padding-block: calc(var(--size-base-space-rem) * 0.45);
  --ui-link-button-sm-padding-inline: var(--size-base-space-rem);
  --ui-link-button-sm-font-size: calc(var(--size-base-space-rem) * 0.8);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-link-button-gap);
  border-radius: var(--radius-pill);
  border: var(--ui-link-button-border-width) solid transparent;
  padding: var(--ui-link-button-padding-block) var(--ui-link-button-padding-inline);
  text-decoration: none;
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--ui-link-button-letter-spacing);
}

.ui-link-button--primary {
  border-color: var(--color-button-border);
  background: var(--gradient-button-default);
  color: var(--color-text-primary);
}

.ui-link-button--secondary {
  border-color: var(--color-button-secondary-border);
  background: var(--color-button-secondary-background);
  color: var(--color-text-primary);
}

.ui-link-button--ghost {
  border-color: transparent;
  color: var(--color-text-primary);
}

.ui-link-button--sm {
  padding: var(--ui-link-button-sm-padding-block) var(--ui-link-button-sm-padding-inline);
  font-size: var(--ui-link-button-sm-font-size);
}
</style>
