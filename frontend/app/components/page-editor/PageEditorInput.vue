<template>
  <UiFormField :label="label" :description="description" :hide-label="labelHidden">
    <template #default="{ id, describedBy }">
      <component
        :is="resolvedComponent"
        v-model="value"
        v-bind="controlProps"
        :id="id"
        :described-by="describedBy"
      />
    </template>
  </UiFormField>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { UiFormField, UiNumberInput, UiSelect, UiTextArea, UiTextInput } from '~/components/ui';

type Kind = 'text' | 'textarea' | 'number' | 'select';

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
    label: string;
    description?: string;
    placeholder?: string;
    kind?: Kind;
    type?: string;
    rows?: number;
    options?: { label: string; value: string | number; disabled?: boolean }[];
    min?: number;
    max?: number;
    step?: number | string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    labelHidden?: boolean;
  }>(),
  {
    modelValue: '',
    description: '',
    placeholder: '',
    kind: 'text',
    type: 'text',
    rows: 4,
    options: () => [],
    min: undefined,
    max: undefined,
    step: undefined,
    disabled: false,
    readonly: false,
    required: false,
    labelHidden: false,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | number | null];
}>();

const resolvedComponent = computed(() => {
  if (props.kind === 'textarea') return UiTextArea;
  if (props.kind === 'number') return UiNumberInput;
  if (props.kind === 'select') return UiSelect;
  return UiTextInput;
});

const controlProps = computed(() => {
  const base = {
    placeholder: props.placeholder,
    disabled: props.disabled,
    readonly: props.readonly,
    required: props.required,
  };

  if (props.kind === 'textarea') {
    return {
      ...base,
      rows: props.rows,
    };
  }

  if (props.kind === 'number') {
    return {
      ...base,
      min: props.min,
      max: props.max,
      step: props.step,
      type: 'number',
    };
  }

  if (props.kind === 'select') {
    return {
      ...base,
      options: props.options,
    };
  }

  return {
    ...base,
    type: props.type,
  };
});

const value = computed({
  get: () => props.modelValue,
  set: (next: string | number | null) => emit('update:modelValue', next),
});
</script>
