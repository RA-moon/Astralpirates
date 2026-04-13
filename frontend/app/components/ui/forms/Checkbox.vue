<template>
  <label class="ui-checkbox" :class="[`ui-checkbox--state-${resolvedState}`, { 'ui-checkbox--disabled': disabled }]">
    <input
      class="ui-checkbox__control"
      type="checkbox"
      :checked="isChecked"
      :value="value"
      :disabled="disabled"
      :required="required"
      @change="toggle"
    />
    <span class="ui-checkbox__box" aria-hidden="true">
      <span class="ui-checkbox__check" v-if="isChecked">✓</span>
    </span>
    <span class="ui-checkbox__label">
      <slot />
      <span v-if="description" class="ui-checkbox__description">{{ description }}</span>
    </span>
  </label>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFormFieldContext } from '~/components/ui/internal/formField';

const props = withDefaults(
  defineProps<{
    modelValue?: boolean;
    value?: string | number | boolean;
    description?: string;
    disabled?: boolean;
    required?: boolean;
    state?: 'default' | 'success' | 'error';
  }>(),
  {
    modelValue: false,
    value: true,
    description: '',
    disabled: false,
    required: false,
    state: 'default',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  change: [value: boolean];
}>();

const fieldContext = useFormFieldContext();
const resolvedState = computed(() => fieldContext?.state.value ?? props.state);
const isChecked = computed(() => Boolean(props.modelValue));

const toggle = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.checked);
  emit('change', target.checked);
};
</script>

<style scoped>
.ui-checkbox {
  --ui-checkbox-gap: calc(var(--size-base-space-rem) * 0.6);
  --ui-checkbox-box-size: calc(var(--size-base-space-rem) * 1.1);
  --ui-checkbox-border-width: var(--size-base-layout-px);
  --ui-checkbox-box-radius: var(--space-2xs);
  --ui-checkbox-check-font-size: var(--space-sm);
  --ui-checkbox-label-gap: var(--crew-identity-gap);
  --ui-checkbox-label-font-size: calc(var(--size-base-space-rem) * 0.95);
  --ui-checkbox-description-font-size: calc(var(--size-base-space-rem) * 0.85);

  display: inline-flex;
  gap: var(--ui-checkbox-gap);
  align-items: flex-start;
  cursor: pointer;
  color: var(--color-text-primary);
}

.ui-checkbox__control {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.ui-checkbox__box {
  width: var(--ui-checkbox-box-size);
  height: var(--ui-checkbox-box-size);
  border: var(--ui-checkbox-border-width) solid var(--color-field-border);
  border-radius: var(--ui-checkbox-box-radius);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-panel);
}

.ui-checkbox__check {
  font-size: var(--ui-checkbox-check-font-size);
}

.ui-checkbox__label {
  display: flex;
  flex-direction: column;
  gap: var(--ui-checkbox-label-gap);
  font-size: var(--ui-checkbox-label-font-size);
}

.ui-checkbox__description {
  font-size: var(--ui-checkbox-description-font-size);
  color: var(--color-text-muted);
}

.ui-checkbox--state-error .ui-checkbox__box {
  border-color: var(--color-danger);
}

.ui-checkbox--state-success .ui-checkbox__box {
  border-color: var(--color-success);
}

.ui-checkbox--disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
