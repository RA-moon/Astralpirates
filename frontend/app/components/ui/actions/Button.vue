<template>
  <component
    :is="componentTag"
    class="ui-button"
    :class="[
      `ui-button--${variant}`,
      `ui-button--${size}`,
      { 'ui-button--block': block, 'ui-button--loading': loading },
    ]"
    :type="buttonType"
    :disabled="disabled || loading"
    v-bind="$attrs"
    @click="handleClick"
  >
    <span class="ui-button__content">
      <slot />
    </span>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    as?: string;
    type?: 'button' | 'submit' | 'reset';
    variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline';
    size?: 'md' | 'sm' | 'lg';
    block?: boolean;
    disabled?: boolean;
    loading?: boolean;
  }>(),
  {
    as: 'button',
    type: 'button',
    variant: 'primary',
    size: 'md',
    block: false,
    disabled: false,
    loading: false,
  },
);

const componentTag = computed(() => props.as || 'button');
const buttonType = computed(() => (componentTag.value === 'button' ? props.type : undefined));
const emit = defineEmits<{
  (event: 'click', value: MouseEvent): void;
}>();

const handleClick = (event: MouseEvent) => {
  if (props.disabled || props.loading) {
    event.preventDefault();
    return;
  }
  emit('click', event);
};
</script>

<style scoped>
.ui-button {
  --ui-button-gap: calc(var(--size-base-space-rem) * 0.4);
  --ui-button-border-width: var(--size-base-layout-px);
  --ui-button-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --ui-button-padding-block-md: calc(var(--size-base-space-rem) * 0.65);
  --ui-button-padding-inline-md: var(--space-lg);
  --ui-button-font-size-md: calc(var(--size-base-space-rem) * 0.9);
  --ui-button-padding-block-sm: calc(var(--size-base-space-rem) * 0.45);
  --ui-button-padding-inline-sm: var(--space-md);
  --ui-button-font-size-sm: calc(var(--size-base-space-rem) * 0.8);
  --ui-button-padding-block-lg: calc(var(--size-base-space-rem) * 0.85);
  --ui-button-padding-inline-lg: var(--status-toggle-indent-base);
  --ui-button-font-size-lg: var(--space-md);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--ui-button-gap);
  border-radius: var(--radius-pill);
  border: var(--ui-button-border-width) solid transparent;
  font-weight: var(--font-weight-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ui-button-letter-spacing);
  padding: var(--ui-button-padding-block-md) var(--ui-button-padding-inline-md);
  cursor: pointer;
  transition:
    transform var(--transition-duration-base) var(--transition-ease-standard),
    border-color var(--transition-duration-base) var(--transition-ease-standard);
  text-decoration: none;
}

.ui-button--md {
  font-size: var(--ui-button-font-size-md);
}

.ui-button--sm {
  padding: var(--ui-button-padding-block-sm) var(--ui-button-padding-inline-sm);
  font-size: var(--ui-button-font-size-sm);
}

.ui-button--lg {
  padding: var(--ui-button-padding-block-lg) var(--ui-button-padding-inline-lg);
  font-size: var(--ui-button-font-size-lg);
}

.ui-button--primary {
  border-color: var(--color-button-border);
  background: var(--gradient-button-default);
  color: var(--color-text-primary);
}

.ui-button--secondary {
  border-color: var(--color-button-secondary-border);
  background: var(--color-button-secondary-background);
  color: var(--color-text-primary);
}

.ui-button--ghost {
  border-color: transparent;
  background: transparent;
  color: var(--color-text-primary);
}

.ui-button--outline {
  border-color: var(--color-text-primary);
  background: transparent;
  color: var(--color-text-primary);
}

.ui-button--destructive {
  border-color: var(--color-danger);
  background: var(--color-surface-danger-weak);
  color: var(--color-danger);
}

.ui-button--block {
  width: 100%;
}

.ui-button--loading {
  opacity: 0.6;
  cursor: progress;
}
</style>
