<template>
  <button
    type="button"
    class="ui-switch"
    :class="{ 'ui-switch--on': modelValue, 'ui-switch--disabled': disabled }"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    @click="toggle"
  >
    <span class="ui-switch__thumb"></span>
    <span class="ui-switch__label">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    disabled?: boolean;
  }>(),
  {
    modelValue: false,
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  change: [value: boolean];
}>();

const toggle = () => {
  if (props.disabled) return;
  const next = !props.modelValue;
  emit('update:modelValue', next);
  emit('change', next);
};
</script>

<style scoped>
.ui-switch {
  --ui-switch-gap: calc(var(--size-base-space-rem) * 0.45);
  --ui-switch-border-width: var(--size-base-layout-px);
  --ui-switch-track-width: calc(var(--size-base-space-rem) * 2.2);
  --ui-switch-track-height: calc(var(--size-base-space-rem) * 1.1);
  --ui-switch-thumb-size: var(--size-base-space-rem);
  --ui-switch-thumb-offset: calc(var(--size-base-space-rem) * 0.05);
  --ui-switch-thumb-translate-x: calc(var(--size-base-space-rem) * 1.05);

  display: inline-flex;
  align-items: center;
  gap: var(--ui-switch-gap);
  border: var(--ui-switch-border-width) solid transparent;
  background: transparent;
  padding: 0;
  cursor: pointer;
  color: var(--color-text-primary);
}

.ui-switch__thumb {
  width: var(--ui-switch-track-width);
  height: var(--ui-switch-track-height);
  border-radius: var(--radius-pill);
  background: var(--color-surface-toggle-off);
  position: relative;
  transition: background var(--transition-duration-base) var(--transition-ease-standard);
}

.ui-switch__thumb::after {
  content: '';
  position: absolute;
  width: var(--ui-switch-thumb-size);
  height: var(--ui-switch-thumb-size);
  border-radius: 50%;
  background: var(--color-text-primary);
  top: var(--ui-switch-thumb-offset);
  left: var(--ui-switch-thumb-offset);
  transition: transform var(--transition-duration-base) var(--transition-ease-standard);
}

.ui-switch--on .ui-switch__thumb {
  background: var(--color-accent-secondary);
}

.ui-switch--on .ui-switch__thumb::after {
  transform: translateX(var(--ui-switch-thumb-translate-x));
}

.ui-switch--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
