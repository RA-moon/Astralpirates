<template>
  <div
    class="ui-input"
    :class="[
      `ui-input--state-${resolvedState}`,
      sizeClass,
      {
        'ui-input--disabled': disabled,
        'ui-input--with-prefix': Boolean($slots.prefix),
        'ui-input--with-suffix': Boolean($slots.suffix),
      },
    ]"
  >
    <span v-if="$slots.prefix" class="ui-input__affix ui-input__affix--prefix">
      <slot name="prefix" />
    </span>
    <input
      ref="inputRef"
      class="ui-input__control"
      :id="controlId"
      :type="type"
      :value="modelValue ?? ''"
      :disabled="disabled"
      :readonly="readonly"
      :required="required"
      :placeholder="placeholder"
      :autocomplete="autocomplete"
      :aria-describedby="describedBy || undefined"
      v-bind="$attrs"
      @input="handleInput"
      @change="$emit('change', $event)"
      @focus="$emit('focus', $event)"
      @blur="$emit('blur', $event)"
    />
    <span v-if="$slots.suffix" class="ui-input__affix ui-input__affix--suffix">
      <slot name="suffix" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFormFieldContext } from '~/components/ui/internal/formField';
import { useStableId } from '~/composables/useStableId';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
    type?: string;
    id?: string;
    placeholder?: string;
    autocomplete?: string;
    size?: 'md' | 'sm';
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    state?: 'default' | 'success' | 'error';
    describedBy?: string;
  }>(),
  {
    modelValue: '',
    type: 'text',
    id: undefined,
    placeholder: '',
    autocomplete: 'off',
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

const localId = useStableId('ui-input');
const controlId = computed(() => props.id ?? fieldContext?.id.value ?? localId);
const describedBy = computed(() => props.describedBy ?? fieldContext?.describedBy.value ?? undefined);
const resolvedState = computed(() => fieldContext?.state.value ?? props.state);
const sizeClass = computed(() => `ui-input--${props.size}`);

const inputRef = ref<HTMLInputElement | null>(null);

const handleInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  emit('update:modelValue', target.value);
};

const focus = () => {
  inputRef.value?.focus();
};

const blur = () => {
  inputRef.value?.blur();
};

defineExpose({
  focus,
  blur,
  input: inputRef,
});
</script>

<style scoped>
.ui-input {
  --ui-input-gap: var(--crew-identity-gap);
  --ui-input-border-width: var(--size-base-layout-px);
  --ui-input-padding-block: var(--space-xs);
  --ui-input-padding-inline: var(--space-sm);
  --ui-input-sm-padding-block: calc(var(--size-base-space-rem) * 0.3);
  --ui-input-sm-padding-inline: calc(var(--size-base-space-rem) * 0.6);
  --ui-input-affix-padding-inline: var(--crew-identity-gap);

  position: relative;
  display: flex;
  align-items: center;
  gap: var(--ui-input-gap);
  border: var(--ui-input-border-width) solid var(--color-field-border);
  border-radius: var(--radius-sm);
  background: var(--color-field-background);
  padding: var(--ui-input-padding-block) var(--ui-input-padding-inline);
  transition: border-color var(--transition-duration-base) var(--transition-ease-standard);
}

.ui-input--sm {
  padding: var(--ui-input-sm-padding-block) var(--ui-input-sm-padding-inline);
}

.ui-input--state-success {
  border-color: var(--color-success);
}

.ui-input--state-error {
  border-color: var(--color-danger);
}

.ui-input--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.ui-input__control {
  appearance: none;
  border: none;
  outline: none;
  background: transparent;
  color: var(--color-text-primary);
  font: inherit;
  width: 100%;
}

.ui-input__control::placeholder {
  color: var(--color-text-caption);
}

.ui-input__affix {
  display: inline-flex;
  align-items: center;
  color: var(--color-text-secondary);
}

.ui-input--with-prefix {
  padding-left: var(--ui-input-affix-padding-inline);
}

.ui-input--with-suffix {
  padding-right: var(--ui-input-affix-padding-inline);
}
</style>
