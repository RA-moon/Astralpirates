<template>
  <aside
    class="ui-alert"
    :class="[`ui-alert--${variant}`, `ui-alert--${layout}`]"
    role="status"
  >
    <div class="ui-alert__icon">
      <slot name="icon">
        <span aria-hidden="true">{{ defaultIcon }}</span>
      </slot>
    </div>
    <div class="ui-alert__body">
      <p v-if="title" class="ui-alert__title">{{ title }}</p>
      <p v-if="description" class="ui-alert__description">{{ description }}</p>
      <slot />
      <div v-if="$slots.actions" class="ui-alert__actions">
        <slot name="actions" />
      </div>
    </div>
    <button
      v-if="closable"
      class="ui-alert__close"
      type="button"
      :aria-label="closeLabel"
      @click="$emit('close')"
    >
      ×
    </button>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    variant?: 'info' | 'success' | 'warning' | 'danger';
    layout?: 'card' | 'inline';
    closable?: boolean;
    closeLabel?: string;
  }>(),
  {
    title: '',
    description: '',
    variant: 'info',
    layout: 'card',
    closable: false,
    closeLabel: 'Dismiss alert',
  },
);

defineEmits<{
  close: [];
}>();

const defaultIcon = computed(() => {
  const icons: Record<string, string> = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    danger: '⛔️',
  };
  return icons[props.variant] ?? icons.info;
});
</script>

<style scoped>
.ui-alert {
  --ui-alert-border-width: var(--size-base-layout-px);
  --ui-alert-icon-font-size: calc(var(--size-base-space-rem) * 1.25);
  --ui-alert-title-font-size: calc(var(--size-base-space-rem) * 0.85);
  --ui-alert-title-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 0.5);
  --ui-alert-description-font-size: calc(var(--size-base-space-rem) * 0.95);
  --ui-alert-close-font-size: calc(var(--size-base-space-rem) * 1.2);
  --ui-alert-inline-padding-block: var(--crew-identity-gap);
  --ui-alert-inline-padding-inline: var(--space-sm);

  display: flex;
  gap: var(--space-sm);
  border-radius: var(--radius-md);
  border: var(--ui-alert-border-width) solid var(--color-border-weak);
  background: var(--color-surface-panel);
  padding: var(--space-sm) var(--space-md);
  align-items: flex-start;
  position: relative;
  color: var(--color-text-primary);
}

.ui-alert__icon {
  font-size: var(--ui-alert-icon-font-size);
  line-height: 1;
}

.ui-alert__title {
  margin: 0;
  font-weight: var(--font-weight-semibold);
  letter-spacing: var(--ui-alert-title-letter-spacing);
  text-transform: uppercase;
  font-size: var(--ui-alert-title-font-size);
}

.ui-alert__description {
  margin: var(--space-2xs) 0 0;
  color: var(--color-text-muted);
  font-size: var(--ui-alert-description-font-size);
}

.ui-alert__actions {
  margin-top: var(--space-xs);
  display: inline-flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.ui-alert__close {
  appearance: none;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: var(--ui-alert-close-font-size);
  line-height: 1;
  margin-left: auto;
}

.ui-alert__close:hover,
.ui-alert__close:focus-visible {
  color: var(--color-text-secondary);
}

.ui-alert--inline {
  padding: var(--ui-alert-inline-padding-block) var(--ui-alert-inline-padding-inline);
  border-radius: var(--radius-pill);
  align-items: center;
}

.ui-alert--inline .ui-alert__title {
  text-transform: none;
  letter-spacing: normal;
  font-size: var(--ui-alert-title-font-size);
}

.ui-alert--inline .ui-alert__description {
  display: none;
}

.ui-alert--info {
  border-color: var(--color-border-status-info);
  background: var(--color-surface-info-weak);
}

.ui-alert--success {
  border-color: var(--color-border-status-success);
  background: var(--color-surface-success-weak);
}

.ui-alert--warning {
  border-color: var(--color-border-status-warning);
  background: var(--color-surface-warning-weak);
}

.ui-alert--danger {
  border-color: var(--color-border-status-danger);
  background: var(--color-surface-danger-weak);
}
</style>
