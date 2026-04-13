<template>
  <component :is="as" class="ui-inline" :style="styleVars">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    as?: string;
    gap?: string | number;
    wrap?: boolean;
    align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
    justify?: 'start' | 'center' | 'end' | 'between';
  }>(),
  {
    as: 'div',
    gap: 'var(--space-sm)',
    wrap: true,
    align: 'center',
    justify: 'start',
  },
);

const normalize = (value: string | number) => (typeof value === 'number' ? `${value}px` : value);

const justifyMap: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};

const alignMap: Record<string, string> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};

const styleVars = computed(() => ({
  '--inline-gap': normalize(props.gap),
  '--inline-wrap': props.wrap ? 'wrap' : 'nowrap',
  '--inline-align': alignMap[props.align] ?? props.align,
  '--inline-justify': justifyMap[props.justify] ?? props.justify,
}));
</script>

<style scoped>
.ui-inline {
  display: flex;
  flex-direction: row;
  align-items: var(--inline-align, center);
  justify-content: var(--inline-justify, flex-start);
  flex-wrap: var(--inline-wrap, wrap);
  gap: var(--inline-gap, var(--space-sm));
}
</style>
