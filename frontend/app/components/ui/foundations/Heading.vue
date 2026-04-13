<template>
  <component
    :is="tag"
    :class="[
      'ui-heading',
      sizeClass,
      weightClass,
      animationClasses,
      { 'ui-heading--muted': muted, 'ui-heading--uppercase': uppercase },
    ]"
  >
    <slot />
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    level?: 1 | 2 | 3 | 4 | 5 | 6;
    as?: string;
    size?: 'display' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    weight?: 'regular' | 'semibold';
    muted?: boolean;
    uppercase?: boolean;
    animated?: boolean | 'auto';
    animationDirection?: 'auto' | 'normal' | 'reverse';
  }>(),
  {
    level: 2,
    as: undefined,
    size: undefined,
    weight: 'semibold',
    muted: false,
    uppercase: true,
    animated: 'auto',
    animationDirection: 'auto',
  },
);

const tag = computed(() => props.as ?? `h${props.level}`);
const sizeToken = computed(() => props.size ?? `h${props.level}`);
const sizeClass = computed(() => `ui-heading--size-${sizeToken.value}`);
const weightClass = computed(() => `ui-heading--weight-${props.weight}`);
const shouldAnimate = computed(() => {
  if (props.animated === 'auto') {
    return props.level <= 2;
  }
  return Boolean(props.animated);
});

const animationClasses = computed(() => {
  if (!shouldAnimate.value) return [];

  const classes = ['animated-title'];
  const shouldReverse =
    props.animationDirection === 'reverse' ||
    (props.animationDirection === 'auto' && props.level % 2 === 0);
  if (shouldReverse) classes.push('animated-title--reverse');
  return classes;
});
</script>

<style scoped>
.ui-heading {
  margin: 0;
  font-family: var(--font-family-display);
  color: var(--color-text-primary);
  letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 0.5);
  line-height: 1.1;
}

.ui-heading--uppercase {
  text-transform: uppercase;
}

.ui-heading--muted {
  color: var(--color-text-muted);
}

.ui-heading--weight-regular {
  font-weight: var(--font-weight-regular);
}

.ui-heading--weight-semibold {
  font-weight: var(--font-weight-semibold);
}

.ui-heading--size-display {
  font-size: calc(var(--heading-size-h1) * 1.25);
}

.ui-heading--size-h1 {
  font-size: var(--heading-size-h1);
}

.ui-heading--size-h2 {
  font-size: var(--heading-size-h2);
}

.ui-heading--size-h3 {
  font-size: var(--heading-size-h3);
}

.ui-heading--size-h4 {
  font-size: var(--heading-size-h4);
}

.ui-heading--size-h5 {
  font-size: var(--heading-size-h5);
}

.ui-heading--size-h6 {
  font-size: var(--heading-size-h6);
}
</style>
