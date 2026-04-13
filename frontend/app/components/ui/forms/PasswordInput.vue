<template>
  <UiTextInput
    v-bind="inputProps"
    :type="isVisible ? 'text' : 'password'"
    @update:model-value="$emit('update:modelValue', $event)"
    @change="$emit('change', $event)"
    @focus="$emit('focus', $event)"
    @blur="$emit('blur', $event)"
  >
    <template v-if="$slots.prefix" #prefix>
      <slot name="prefix" />
    </template>
    <template #suffix>
      <button
        type="button"
        class="ui-password-toggle"
        @click="toggle"
        :aria-label="isVisible ? 'Hide password' : 'Show password'"
      >
        {{ isVisible ? 'Hide' : 'Show' }}
      </button>
    </template>
  </UiTextInput>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import UiTextInput from './TextInput.vue';

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
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
    id: undefined,
    placeholder: '',
    autocomplete: 'current-password',
    size: 'md',
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

const isVisible = ref(false);
const toggle = () => {
  isVisible.value = !isVisible.value;
};

const inputProps = computed(() => ({
  ...props,
}));
</script>

<style scoped>
.ui-password-toggle {
  --ui-password-toggle-font-size: calc(var(--size-base-space-rem) * 0.8 * var(--size-scale-factor));

  border: none;
  background: transparent;
  color: var(--color-accent-secondary);
  font: inherit;
  font-size: var(--ui-password-toggle-font-size);
  text-transform: uppercase;
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  cursor: pointer;
}
</style>
