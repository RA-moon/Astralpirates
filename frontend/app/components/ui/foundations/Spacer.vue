<template>
  <component :is="as" class="ui-spacer" :style="styleVars" aria-hidden="true" />
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    as?: string;
    size?: string | number;
    direction?: 'vertical' | 'horizontal';
  }>(),
  {
    as: 'div',
    size: 'var(--space-md)',
    direction: 'vertical',
  },
);

const normalize = (value: string | number) => (typeof value === 'number' ? `${value}px` : value);

const styleVars = computed(() => {
  const value = normalize(props.size);
  const baseEdge = 'var(--size-base-layout-px)';
  return props.direction === 'horizontal'
    ? { width: value, height: baseEdge }
    : { height: value, width: baseEdge };
});
</script>

<style scoped>
.ui-spacer {
  display: block;
  flex-shrink: 0;
}
</style>
