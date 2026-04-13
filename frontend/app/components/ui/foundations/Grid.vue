<template>
  <component :is="as" class="ui-grid" :style="styleVars">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    as?: string;
    gap?: string | number;
    minColumnWidth?: string | number;
    columns?: number | null;
    align?: 'start' | 'center' | 'end' | 'stretch';
  }>(),
  {
    as: 'div',
    gap: 'var(--space-lg)',
    minColumnWidth: 'calc(var(--size-base-layout-px) * 220 * var(--size-scale-factor))',
    columns: null,
    align: 'stretch',
  },
);

const normalize = (value: string | number) => (typeof value === 'number' ? `${value}px` : value);

const styleVars = computed(() => ({
  '--grid-gap': normalize(props.gap),
  '--grid-align': props.align,
  '--grid-template': props.columns
    ? `repeat(${props.columns}, minmax(0, 1fr))`
    : `repeat(auto-fit, minmax(${normalize(props.minColumnWidth)}, 1fr))`,
}));
</script>

<style scoped>
.ui-grid {
  display: grid;
  gap: var(--grid-gap, var(--space-lg));
  align-items: var(--grid-align, stretch);
  grid-template-columns: var(--grid-template, repeat(auto-fit, minmax(calc(var(--size-base-layout-px) * 200 * var(--size-scale-factor)), 1fr)));
}
</style>
