<template>
  <span class="ui-badge-anchor">
    <slot />
    <span v-if="showBadge" class="ui-badge-anchor__badge" :style="badgeStyle">
      <slot name="badge">
        <UiBadge
          :value="value"
          :max="max"
          :variant="variant"
          :size="size"
          :aria-label="ariaLabel ?? null"
        />
      </slot>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue';
import UiBadge from './Badge.vue';

type AnchorPosition = 'top-end' | 'top-start' | 'bottom-end' | 'bottom-start';

const props = withDefaults(
  defineProps<{
    value?: number | string | null;
    max?: number;
    variant?: 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'info';
    size?: 'sm' | 'md';
    position?: AnchorPosition;
    offset?: string | number;
    ariaLabel?: string | null;
    showZero?: boolean;
  }>(),
  {
    value: null,
    max: 99,
    variant: 'danger',
    size: 'sm',
    position: 'top-end',
    offset: '0',
    ariaLabel: null,
    showZero: false,
  },
);

const slots = useSlots();

const normalizeOffset = computed(() =>
  typeof props.offset === 'number' ? `${props.offset}px` : props.offset,
);

const badgeStyle = computed(() => {
  const offset = normalizeOffset.value;
  const style: Record<string, string> = {};
  const isTop = props.position.startsWith('top');
  const isEnd = props.position.endsWith('end');

  style[isTop ? 'top' : 'bottom'] = offset;
  style[isEnd ? 'right' : 'left'] = offset;

  const transforms: Record<AnchorPosition, string> = {
    'top-end': 'translate(50%, -50%)',
    'top-start': 'translate(-50%, -50%)',
    'bottom-end': 'translate(50%, 50%)',
    'bottom-start': 'translate(-50%, 50%)',
  };

  style.transform = transforms[props.position];

  return style;
});

const hasCustomBadge = computed(() => Boolean(slots.badge));

const showBadge = computed(() => {
  if (hasCustomBadge.value) return true;
  if (props.value === null || typeof props.value === 'undefined') return false;
  if (typeof props.value === 'number') {
    return props.showZero ? true : props.value > 0;
  }
  const stringValue = String(props.value).trim();
  return props.showZero ? true : stringValue.length > 0;
});
</script>

<style scoped>
.ui-badge-anchor {
  position: relative;
  display: inline-flex;
}

.ui-badge-anchor__badge {
  position: absolute;
  pointer-events: none;
  z-index: 1;
}
</style>
