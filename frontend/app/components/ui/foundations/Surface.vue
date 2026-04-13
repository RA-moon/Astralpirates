<template>
  <component
    :is="as"
    :class="['ui-surface', `ui-surface--${variant}`, { 'ui-surface--borderless': borderless }]"
    :style="{ padding: paddingValue }"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    as?: string;
    variant?: 'panel' | 'card' | 'subtle';
    padding?: string | number | null;
    borderless?: boolean;
  }>(),
  {
    as: 'section',
    variant: 'panel',
    padding: 'var(--layout-card-padding)',
    borderless: false,
  },
);

const paddingValue =
  typeof props.padding === 'number'
    ? `${props.padding}px`
    : props.padding === null
      ? undefined
      : props.padding ?? 'var(--layout-card-padding)';
</script>

<style scoped>
.ui-surface {
  border-radius: var(--layout-card-radius);
  border: var(--size-base-layout-px) solid var(--color-border-weak);
  background: var(--color-surface-panel);
  box-shadow: var(--shadow-card);
}

.ui-surface--card {
  background: var(--color-surface-panel);
}

.ui-surface--panel {
  background: var(--color-surface-panel-strong);
}

.ui-surface--subtle {
  background: var(--color-surface-base);
  box-shadow: none;
}

.ui-surface--borderless {
  border-color: transparent;
}
</style>
