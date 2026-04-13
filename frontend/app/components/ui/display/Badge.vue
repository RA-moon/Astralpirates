<template>
  <span
    class="ui-badge"
    :class="[`ui-badge--${variant}`, `ui-badge--${size}`]"
    v-bind="accessibilityAttrs"
  >
    <slot>{{ displayValue }}</slot>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    value?: number | string | null;
    max?: number;
    variant?: 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'info';
    size?: 'sm' | 'md';
    ariaLabel?: string | null;
  }>(),
  {
    value: null,
    max: 99,
    variant: 'default',
    size: 'md',
    ariaLabel: null,
  },
);

const displayValue = computed(() => {
  if (props.value === null || typeof props.value === 'undefined') {
    return '';
  }

  if (typeof props.value === 'number' && typeof props.max === 'number') {
    return props.value > props.max ? `${props.max}+` : String(props.value);
  }

  return String(props.value);
});

const accessibilityAttrs = computed(() => {
  if (props.ariaLabel) {
    return {
      role: 'status',
      'aria-label': props.ariaLabel,
    };
  }

  return {
    'aria-hidden': true,
  };
});
</script>

<style scoped>
.ui-badge {
  --ui-badge-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 0.5);
  --ui-badge-border-width: var(--size-base-layout-px);
  --ui-badge-md-min-width: calc(var(--size-base-space-rem) * 1.6);
  --ui-badge-md-padding-inline: calc(var(--size-base-space-rem) * 0.45);
  --ui-badge-sm-padding-inline: var(--crew-identity-gap);
  --ui-badge-sm-min-edge: calc(var(--size-badge-sm) * 0.8);
  --ui-badge-sm-font-size: calc(var(--size-base-space-rem) * 0.65);
  --ui-badge-md-font-size: calc(var(--size-base-space-rem) * 0.72);
  --ui-badge-md-min-height: calc(var(--size-badge-sm) * 0.9);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  background: var(--color-badge-background);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--ui-badge-letter-spacing);
  text-transform: uppercase;
  line-height: 1;
  padding: 0 var(--ui-badge-md-padding-inline);
  min-width: var(--ui-badge-md-min-width);
  border: var(--ui-badge-border-width) solid transparent;
}

.ui-badge--sm {
  font-size: var(--ui-badge-sm-font-size);
  min-height: var(--ui-badge-sm-min-edge);
  min-width: var(--ui-badge-sm-min-edge);
  padding: 0 var(--ui-badge-sm-padding-inline);
}

.ui-badge--md {
  font-size: var(--ui-badge-md-font-size);
  min-height: var(--ui-badge-md-min-height);
}

.ui-badge--muted {
  background: var(--color-surface-base);
  color: var(--color-text-muted);
  border-color: var(--color-border-weak);
}

.ui-badge--success {
  background: var(--color-surface-success-weak);
  border-color: var(--color-border-status-success);
  color: var(--color-success);
}

.ui-badge--warning {
  background: var(--color-surface-warning-weak);
  border-color: var(--color-border-status-warning);
  color: var(--color-warning);
}

.ui-badge--danger {
  background: var(--color-surface-danger-weak);
  border-color: var(--color-border-status-danger);
  color: var(--color-danger);
}

.ui-badge--info {
  background: var(--color-surface-info-weak);
  border-color: var(--color-border-status-info);
  color: var(--color-info);
}
</style>
