<template>
  <input
    ref="inputRef"
    class="ui-file-input"
    :id="controlId"
    type="file"
    :accept="accept"
    :multiple="multiple"
    :name="name"
    :disabled="isDisabled"
    :required="isRequired"
    :aria-describedby="resolvedDescribedBy || undefined"
    v-bind="$attrs"
    @change="handleChange"
    @focus="$emit('focus', $event)"
    @blur="$emit('blur', $event)"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useFormFieldContext } from '~/components/ui/internal/formField';
import { useStableId } from '~/composables/useStableId';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    accept?: string;
    multiple?: boolean;
    name?: string;
    id?: string;
    disabled?: boolean;
    required?: boolean;
    describedBy?: string;
  }>(),
  {
    accept: undefined,
    multiple: false,
    name: undefined,
    id: undefined,
    disabled: false,
    required: false,
    describedBy: undefined,
  },
);

const emit = defineEmits<{
  change: [event: Event];
  focus: [event: FocusEvent];
  blur: [event: FocusEvent];
}>();

const fieldContext = useFormFieldContext();
const inputRef = ref<HTMLInputElement | null>(null);
const localId = useStableId('ui-file-input');

const controlId = computed(() => props.id ?? fieldContext?.id.value ?? localId);
const resolvedDescribedBy = computed(() => props.describedBy ?? fieldContext?.describedBy.value ?? undefined);
const isDisabled = computed(() => fieldContext?.disabled.value ?? props.disabled ?? false);
const isRequired = computed(() => fieldContext?.required.value ?? props.required ?? false);

const handleChange = (event: Event) => {
  emit('change', event);
};

const files = computed(() => inputRef.value?.files ?? null);
const clear = () => {
  if (inputRef.value) {
    inputRef.value.value = '';
  }
};

defineExpose({
  input: inputRef,
  files,
  clear,
});
</script>

<style scoped>
.ui-file-input {
  --ui-file-input-border-width: var(--size-base-layout-px);
  --ui-file-input-padding: calc(var(--size-base-space-rem) * 0.45);
  --ui-file-input-button-padding-block: var(--crew-identity-gap);
  --ui-file-input-button-padding-inline: var(--space-sm);
  --ui-file-input-button-margin-inline-end: var(--space-sm);
  --ui-file-input-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --ui-file-input-focus-outline-width: calc(var(--size-base-layout-px) * 2);
  --ui-file-input-focus-outline-offset: calc(var(--size-base-layout-px) * 2);

  width: 100%;
  border: var(--ui-file-input-border-width) solid var(--color-field-border);
  border-radius: var(--radius-sm);
  background: var(--color-field-background);
  color: var(--color-text-primary);
  padding: var(--ui-file-input-padding);
  font: inherit;
}

.ui-file-input::file-selector-button {
  border: none;
  border-right: var(--ui-file-input-border-width) solid var(--color-field-border);
  padding: var(--ui-file-input-button-padding-block) var(--ui-file-input-button-padding-inline);
  margin-right: var(--ui-file-input-button-margin-inline-end);
  background: var(--color-field-background);
  color: var(--color-text-primary);
  font: inherit;
  cursor: pointer;
  text-transform: uppercase;
  letter-spacing: var(--ui-file-input-letter-spacing);
}

.ui-file-input:focus-visible {
  outline: var(--ui-file-input-focus-outline-width) solid var(--color-border-focus);
  outline-offset: var(--ui-file-input-focus-outline-offset);
}
</style>
