<template>
  <UiTextInput
    v-bind="inputProps"
    type="number"
    @update:model-value="$emit('update:modelValue', $event)"
    @change="$emit('change', $event)"
    @focus="$emit('focus', $event)"
    @blur="$emit('blur', $event)"
  >
    <template v-if="$slots.prefix" #prefix>
      <slot name="prefix" />
    </template>
    <template v-if="$slots.suffix" #suffix>
      <slot name="suffix" />
    </template>
  </UiTextInput>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiTextInput from './TextInput.vue';

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
    id?: string;
    placeholder?: string;
    min?: number | string;
    max?: number | string;
    step?: number | string | 'any';
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    state?: 'default' | 'success' | 'error';
    describedBy?: string;
  }>(),
  {
    modelValue: '',
    id: undefined,
    placeholder: '',
    min: undefined,
    max: undefined,
    step: undefined,
    disabled: false,
    readonly: false,
    required: false,
    state: 'default',
    describedBy: undefined,
  },
);

defineEmits<{
  'update:modelValue': [value: string];
  change: [event: Event];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const coerceNumber = (value?: number | string) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const resolveStep = (value?: number | string | 'any') => {
  if (value === 'any') return 'any';
  return coerceNumber(value);
};

const inputProps = computed(() => ({
  ...props,
  min: coerceNumber(props.min),
  max: coerceNumber(props.max),
  step: resolveStep(props.step),
  type: 'number',
}));
</script>
