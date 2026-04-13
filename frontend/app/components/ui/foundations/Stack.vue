<template>
  <component :is="as" class="ui-stack" :style="styleVars">
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    as?: string;
    gap?: string | number;
    align?: 'start' | 'center' | 'end' | 'stretch';
    justify?: 'start' | 'center' | 'end' | 'between';
  }>(),
  {
    as: 'div',
    gap: 'var(--space-md)',
    align: 'stretch',
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
};

const styleVars = computed(() => ({
  '--stack-gap': normalize(props.gap),
  '--stack-align': alignMap[props.align] ?? props.align,
  '--stack-justify': justifyMap[props.justify] ?? props.justify,
}));
</script>

<style scoped>
.ui-stack {
  display: flex;
  flex-direction: column;
  gap: var(--stack-gap, var(--space-md));
  align-items: var(--stack-align, stretch);
  justify-content: var(--stack-justify, flex-start);
}
</style>
