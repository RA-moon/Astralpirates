<template>
  <component
    :is="as"
    class="ui-divider"
    role="separator"
    :aria-orientation="orientation"
    :style="styleVars"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    as?: string;
    orientation?: 'horizontal' | 'vertical';
    thickness?: string | number;
  }>(),
  {
    as: 'hr',
    orientation: 'horizontal',
    thickness: 'var(--size-base-layout-px)',
  },
);

const normalize = (value: string | number) => (typeof value === 'number' ? `${value}px` : value);

const styleVars = computed(() => {
  const thickness = normalize(props.thickness);
  if (props.orientation === 'vertical') {
    return {
      width: thickness,
      height: '100%',
    };
  }
  return {
    height: thickness,
    width: '100%',
  };
});
</script>

<style scoped>
.ui-divider {
  border: none;
  background: var(--color-border-weak);
  margin: 0;
  flex-shrink: 0;
}
</style>
