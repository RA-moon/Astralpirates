<template>
  <UiTextInput
    v-bind="inputProps"
    type="search"
    autocomplete="off"
    @update:model-value="$emit('update:modelValue', $event)"
    @change="$emit('change', $event)"
    @focus="$emit('focus', $event)"
    @blur="$emit('blur', $event)"
  >
    <template #prefix>
      <span class="ui-search-input__icon" aria-hidden="true">⌕</span>
    </template>
  </UiTextInput>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import UiTextInput from './TextInput.vue';

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    id?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    required?: boolean;
    state?: 'default' | 'success' | 'error';
    describedBy?: string;
  }>(),
  {
    modelValue: '',
    id: undefined,
    placeholder: 'Search…',
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

const inputProps = computed(() => ({
  ...props,
  size: 'md' as const,
}));
</script>

<style scoped>
.ui-search-input__icon {
  font-size: calc(var(--size-base-space-rem) * 0.9 * var(--size-scale-factor));
  opacity: 0.75;
}
</style>
