<template>
  <component
    :is="as"
    :class="['ui-icon', `ui-icon--${color}`]"
    :style="styleVars"
    :role="label ? 'img' : undefined"
    :aria-label="label ?? undefined"
    :aria-hidden="label ? 'false' : 'true'"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    as?: string;
    size?: 'sm' | 'md' | 'lg' | number | `${number}px`;
    color?: 'inherit' | 'muted' | 'accent';
    label?: string | null;
  }>(),
  {
    as: 'span',
    size: 'md',
    color: 'inherit',
    label: null,
  },
);

const sizeMap: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'var(--space-md)',
  md: 'var(--space-lg)',
  lg: 'var(--space-xl)',
};

const resolvedSize = computed(() => {
  if (typeof props.size === 'number') {
    return `calc(var(--size-base-layout-px) * ${props.size})`;
  }
  if (props.size && props.size in sizeMap) {
    return sizeMap[props.size as keyof typeof sizeMap];
  }
  return String(props.size);
});

const styleVars = computed(() => ({
  '--ui-icon-size': resolvedSize.value,
}));
</script>

<style scoped>
.ui-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--ui-icon-size, var(--space-lg));
  height: var(--ui-icon-size, var(--space-lg));
  color: currentColor;
}

.ui-icon--muted {
  color: var(--color-text-muted);
}

.ui-icon--accent {
  color: var(--color-accent-secondary);
}
</style>
