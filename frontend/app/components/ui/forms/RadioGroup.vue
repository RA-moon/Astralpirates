<template>
  <div class="ui-radio-group" role="radiogroup" :aria-disabled="disabled ? true : undefined">
    <label
      v-for="option in options"
      :key="option.value"
      class="ui-radio"
      :class="{ 'ui-radio--disabled': disabled || option.disabled }"
    >
      <input
        type="radio"
        class="ui-radio__control"
        :name="groupName"
        :value="option.value"
        :checked="option.value === modelValue"
        :disabled="disabled || option.disabled"
        @change="() => select(option.value)"
      />
      <span class="ui-radio__marker" aria-hidden="true">
        <span class="ui-radio__dot" v-if="option.value === modelValue"></span>
      </span>
      <span class="ui-radio__label">
        {{ option.label }}
        <span v-if="option.description" class="ui-radio__description">{{ option.description }}</span>
      </span>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useStableId } from '~/composables/useStableId';

type RadioOption = {
  label: string;
  value: string | number;
  description?: string;
  disabled?: boolean;
};

const props = withDefaults(
  defineProps<{
    modelValue?: string | number | null;
    options?: RadioOption[];
    disabled?: boolean;
    name?: string;
  }>(),
  {
    modelValue: '',
    options: () => [],
    disabled: false,
    name: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | number];
  change: [value: string | number];
}>();

const localName = useStableId('ui-radio');
const groupName = computed(() => props.name ?? localName);

const select = (value: string | number) => {
  emit('update:modelValue', value);
  emit('change', value);
};
</script>

<style scoped>
.ui-radio-group {
  --ui-radio-gap: var(--space-sm);
  --ui-radio-item-gap: calc(var(--size-base-space-rem) * 0.65);
  --ui-radio-marker-size: calc(var(--size-base-space-rem) * 1.2);
  --ui-radio-dot-size: var(--space-xs);
  --ui-radio-label-gap: calc(var(--size-base-space-rem) * 0.3);
  --ui-radio-description-font-size: calc(var(--size-base-space-rem) * 0.85);
  --ui-radio-border-width: var(--size-base-layout-px);

  display: grid;
  gap: var(--ui-radio-gap);
}

.ui-radio {
  display: flex;
  gap: var(--ui-radio-item-gap);
  align-items: flex-start;
  cursor: pointer;
  color: var(--color-text-primary);
}

.ui-radio__control {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.ui-radio__marker {
  width: var(--ui-radio-marker-size);
  height: var(--ui-radio-marker-size);
  border-radius: var(--radius-pill);
  border: var(--ui-radio-border-width) solid var(--color-field-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-panel);
}

.ui-radio__dot {
  width: var(--ui-radio-dot-size);
  height: var(--ui-radio-dot-size);
  border-radius: var(--radius-pill);
  background: var(--color-accent-secondary);
}

.ui-radio__label {
  display: flex;
  flex-direction: column;
  gap: var(--ui-radio-label-gap);
}

.ui-radio__description {
  font-size: var(--ui-radio-description-font-size);
  color: var(--color-text-muted);
}

.ui-radio--disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
