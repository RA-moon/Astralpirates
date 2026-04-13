<template>
  <div
    class="ui-form-field"
    :class="[`ui-form-field--state-${state}`, { 'ui-form-field--disabled': disabled }]"
  >
    <label
      v-if="label"
      :class="['ui-form-field__label', { 'ui-form-field__label--hidden': hideLabel }]"
      :for="resolvedInputId"
      :id="labelId"
    >
      {{ label }}
      <span v-if="required" class="ui-form-field__required" aria-hidden="true">*</span>
    </label>

    <p v-if="description" class="ui-form-field__description" :id="descriptionId">
      {{ description }}
    </p>

    <slot
      :id="resolvedInputId"
      :described-by="describedBy"
      :state="state"
      :disabled="disabled"
      :required="required"
    />

    <p
      v-if="message"
      class="ui-form-field__message"
      :class="{ 'ui-form-field__message--error': state === 'error', 'ui-form-field__message--success': state === 'success' }"
      :id="messageId"
      role="status"
    >
      {{ message }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, provide } from 'vue';
import { formFieldInjectionKey, type FormFieldState } from '~/components/ui/internal/formField';
import { useStableId } from '~/composables/useStableId';

const props = withDefaults(
  defineProps<{
    label?: string;
    description?: string;
    hint?: string;
    message?: string;
    error?: string;
    state?: FormFieldState;
    required?: boolean;
    disabled?: boolean;
    inputId?: string;
    hideLabel?: boolean;
  }>(),
  {
    label: '',
    description: '',
    hint: '',
    message: '',
    error: '',
    state: 'default',
    required: false,
    disabled: false,
    inputId: undefined,
    hideLabel: false,
  },
);

const baseId = props.inputId ?? useStableId('ui-field');
const resolvedInputId = baseId;
const labelId = props.label ? `${baseId}-label` : undefined;
const descriptionId = props.description ? `${baseId}-description` : undefined;
const messageId = computed(() => (message.value ? `${baseId}-message` : undefined));

const state = computed<FormFieldState>(() => (props.error ? 'error' : props.state));
const message = computed(() => props.error || props.message || props.hint || '');

const describedBy = computed(() => {
  const ids = [descriptionId, messageId.value].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
});

provide(formFieldInjectionKey, {
  id: computed(() => resolvedInputId),
  describedBy,
  state,
  disabled: computed(() => props.disabled ?? false),
  required: computed(() => props.required ?? false),
});
</script>

<style scoped>
.ui-form-field {
  --ui-form-field-gap: calc(var(--size-base-space-rem) * 0.45);
  --ui-form-field-label-font-size: calc(var(--size-base-space-rem) * 0.85);
  --ui-form-field-label-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --ui-form-field-hidden-size: var(--size-base-layout-px);
  --ui-form-field-hidden-negative-offset: calc(var(--size-base-layout-px) * -1);
  --ui-form-field-required-margin-inline-start: calc(var(--size-base-space-rem) * 0.2);
  --ui-form-field-description-font-size: calc(var(--size-base-space-rem) * 0.85);
  --ui-form-field-message-font-size: calc(var(--size-base-space-rem) * 0.8);

  display: flex;
  flex-direction: column;
  gap: var(--ui-form-field-gap);
}

.ui-form-field__label {
  font-size: var(--ui-form-field-label-font-size);
  letter-spacing: var(--ui-form-field-label-letter-spacing);
  text-transform: uppercase;
  color: var(--color-text-secondary);
}

.ui-form-field__label--hidden {
  position: absolute;
  width: var(--ui-form-field-hidden-size);
  height: var(--ui-form-field-hidden-size);
  padding: 0;
  margin: var(--ui-form-field-hidden-negative-offset);
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.ui-form-field__required {
  color: var(--color-danger);
  margin-left: var(--ui-form-field-required-margin-inline-start);
}

.ui-form-field__description {
  font-size: var(--ui-form-field-description-font-size);
  color: var(--color-text-meta);
  margin: 0;
}

.ui-form-field__message {
  font-size: var(--ui-form-field-message-font-size);
  color: var(--color-text-meta);
  margin: 0;
}

.ui-form-field__message--error {
  color: var(--color-danger);
}

.ui-form-field__message--success {
  color: var(--color-success);
}

.ui-form-field--disabled {
  opacity: 0.7;
  pointer-events: none;
}
</style>
