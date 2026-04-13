<template>
  <div class="ui-segmented-control" role="group">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="ui-segmented-control__option"
      :class="{ 'ui-segmented-control__option--active': option.value === modelValue }"
      :disabled="disabled || option.disabled"
      @click="() => select(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
type SegmentedOption = {
  label: string;
  value: string | number;
  disabled?: boolean;
};

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
    options?: SegmentedOption[];
    disabled?: boolean;
  }>(),
  {
    modelValue: '',
    options: () => [],
    disabled: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
  change: [value: string | number];
}>();

const select = (value: string | number) => {
  if (props.disabled) return;
  emit('update:modelValue', value);
  emit('change', value);
};
</script>

<style scoped>
.ui-segmented-control {
  display: inline-flex;
  border: var(--size-base-layout-px) solid var(--color-field-border);
  border-radius: var(--radius-pill);
  overflow: hidden;
}

.ui-segmented-control__option {
  --ui-segmented-control-option-pad-y: calc(var(--size-base-space-rem) * 0.4 * var(--size-scale-factor));
  --ui-segmented-control-option-pad-x: calc(var(--size-base-space-rem) * 0.85 * var(--size-scale-factor));
  background: transparent;
  border: none;
  color: var(--color-text-primary);
  padding: var(--ui-segmented-control-option-pad-y) var(--ui-segmented-control-option-pad-x);
  font: inherit;
  cursor: pointer;
}

.ui-segmented-control__option--active {
  background: var(--gradient-button-default);
}

.ui-segmented-control__option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
