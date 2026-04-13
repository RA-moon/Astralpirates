<template>
  <div
    class="ui-textarea"
    :class="[`ui-textarea--state-${resolvedState}`, sizeClass, { 'ui-textarea--disabled': disabled }]"
  >
    <textarea
      :id="controlId"
      class="ui-textarea__control"
      :rows="resolvedRows"
      :value="modelValue ?? ''"
      :placeholder="placeholder"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
      :aria-describedby="describedBy || undefined"
      v-bind="$attrs"
      @input="handleInput"
      @change="$emit('change', $event)"
      @focus="$emit('focus', $event)"
      @blur="$emit('blur', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useFormFieldContext } from '~/components/ui/internal/formField';
import { useStableId } from '~/composables/useStableId';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    id?: string;
    placeholder?: string;
    rows?: number | string;
    size?: 'md' | 'lg';
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
    rows: 4,
    size: 'md',
    disabled: false,
    readonly: false,
    required: false,
    state: 'default',
    describedBy: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [event: Event];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const fieldContext = useFormFieldContext();
const localId = useStableId('ui-textarea');
const controlId = computed(() => props.id ?? fieldContext?.id.value ?? localId);
const describedBy = computed(() => props.describedBy ?? fieldContext?.describedBy.value ?? undefined);
const resolvedState = computed(() => fieldContext?.state.value ?? props.state);
const sizeClass = computed(() => `ui-textarea--${props.size}`);

const resolvedRows = computed(() => {
  const defaultRows = 4;
  const value = props.rows;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return defaultRows;
});

const handleInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  emit('update:modelValue', target.value);
};
</script>

<style scoped>
.ui-textarea {
  --ui-textarea-border-width: var(--size-base-layout-px);

  border: var(--ui-textarea-border-width) solid var(--color-field-border);
  border-radius: var(--radius-md);
  background: var(--color-field-background);
  transition: border-color var(--transition-duration-base) var(--transition-ease-standard);
}

.ui-textarea--state-error {
  border-color: var(--color-danger);
}

.ui-textarea--state-success {
  border-color: var(--color-success);
}

.ui-textarea--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.ui-textarea__control {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--color-text-primary);
  font: inherit;
  padding: var(--space-sm);
  resize: vertical;
}

.ui-textarea--lg .ui-textarea__control {
  min-height: calc(var(--size-base-layout-px) * 200 * var(--size-scale-factor));
}
</style>
