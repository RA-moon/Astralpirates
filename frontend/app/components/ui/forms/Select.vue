<template>
  <div
    class="ui-select"
    :class="[`ui-select--state-${resolvedState}`, { 'ui-select--disabled': disabled }]"
  >
    <select
      class="ui-select__control"
      :id="controlId"
      :value="modelValue ?? ''"
      :disabled="disabled"
      :required="required"
      :aria-describedby="describedBy || undefined"
      v-bind="$attrs"
      @change="handleChange"
      @focus="$emit('focus', $event)"
      @blur="$emit('blur', $event)"
    >
      <option v-if="placeholder" disabled value="">{{ placeholder }}</option>
      <option
        v-for="option in options"
        :key="option.value"
        :value="option.value"
        :disabled="option.disabled"
      >
        {{ option.label }}
      </option>
    </select>
    <span class="ui-select__icon" aria-hidden="true">⌄</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFormFieldContext } from '~/components/ui/internal/formField';
import { useStableId } from '~/composables/useStableId';

defineOptions({ inheritAttrs: false });

type Option = {
  label: string;
  value: string | number;
  disabled?: boolean;
};

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
    options?: Option[];
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    state?: 'default' | 'success' | 'error';
    describedBy?: string;
  }>(),
  {
    modelValue: '',
    options: () => [],
    id: undefined,
    placeholder: '',
    disabled: false,
    required: false,
    state: 'default',
    describedBy: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
  change: [event: Event];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const fieldContext = useFormFieldContext();
const localId = useStableId('ui-select');
const controlId = computed(() => props.id ?? fieldContext?.id.value ?? localId);
const describedBy = computed(() => props.describedBy ?? fieldContext?.describedBy.value ?? undefined);
const resolvedState = computed(() => fieldContext?.state.value ?? props.state);

const handleChange = (event: Event) => {
  const target = event.target as HTMLSelectElement;
  const value = target.value;
  emit('update:modelValue', value);
  emit('change', event);
};
</script>

<style scoped>
.ui-select {
  --ui-select-border-width: var(--size-base-layout-px);
  --ui-select-control-padding-block: calc(var(--size-base-space-rem) * 0.65);
  --ui-select-control-padding-inline-end: calc(var(--size-base-space-rem) * 2.2);
  --ui-select-control-padding-inline-start: var(--space-sm);
  --ui-select-icon-inline-end: calc(var(--size-base-space-rem) * 0.85);

  position: relative;
  border: var(--ui-select-border-width) solid var(--color-field-border);
  border-radius: var(--radius-sm);
  background: var(--color-field-background);
}

.ui-select__control {
  width: 100%;
  background: transparent;
  color: var(--color-text-primary);
  border: none;
  font: inherit;
  padding:
    var(--ui-select-control-padding-block)
    var(--ui-select-control-padding-inline-end)
    var(--ui-select-control-padding-block)
    var(--ui-select-control-padding-inline-start);
  appearance: none;
}

.ui-select__icon {
  position: absolute;
  right: var(--ui-select-icon-inline-end);
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  color: var(--color-text-muted);
}

.ui-select--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.ui-select--state-error {
  border-color: var(--color-danger);
}

.ui-select--state-success {
  border-color: var(--color-success);
}
</style>
