<template>
  <div class="ui-combobox" @keydown.down.prevent="highlightNext" @keydown.up.prevent="highlightPrev" @keydown.enter.prevent="selectHighlighted">
    <UiTextInput
      v-bind="inputProps"
      type="text"
      :model-value="displayValue"
      :aria-expanded="isOpen"
      role="combobox"
      @focus="openList"
      @blur="handleBlur"
      @update:model-value="handleInput"
    >
      <template v-if="$slots.prefix" #prefix>
        <slot name="prefix" />
      </template>
    </UiTextInput>

    <ul
      v-if="isOpen && filteredItems.length"
      class="ui-combobox__list"
      role="listbox"
    >
      <li
        v-for="(item, index) in filteredItems"
        :key="item.value"
        class="ui-combobox__option"
        :class="{ 'ui-combobox__option--active': index === highlightedIndex }"
        role="option"
        @mousedown.prevent="selectItem(item)"
      >
        {{ item.label }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import UiTextInput from './TextInput.vue';

type ComboboxItem = {
  label: string;
  value: string;
};

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    items?: ComboboxItem[];
    placeholder?: string;
  }>(),
  {
    modelValue: '',
    items: () => [],
    placeholder: '',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
  select: [value: ComboboxItem];
}>();

const internalValue = ref(props.modelValue ?? '');
watch(
  () => props.modelValue,
  (next) => {
    if (typeof next === 'string') {
      internalValue.value = next;
    }
  },
);
const isOpen = ref(false);
const highlightedIndex = ref(-1);

const inputProps = computed(() => ({
  placeholder: props.placeholder,
}));

const displayValue = computed(() => internalValue.value);

const filteredItems = computed(() => {
  const query = internalValue.value.trim().toLowerCase();
  if (!query) {
    return props.items;
  }
  return props.items.filter((item) => item.label.toLowerCase().includes(query));
});

const openList = () => {
  isOpen.value = true;
};

const handleBlur = () => {
  setTimeout(() => {
    isOpen.value = false;
    highlightedIndex.value = -1;
  }, 100);
};

const handleInput = (value: string) => {
  internalValue.value = value;
  emit('update:modelValue', value);
  openList();
};

const highlightNext = () => {
  if (!filteredItems.value.length) return;
  highlightedIndex.value = (highlightedIndex.value + 1) % filteredItems.value.length;
  isOpen.value = true;
};

const highlightPrev = () => {
  if (!filteredItems.value.length) return;
  highlightedIndex.value =
    highlightedIndex.value <= 0 ? filteredItems.value.length - 1 : highlightedIndex.value - 1;
  isOpen.value = true;
};

const selectItem = (item: ComboboxItem) => {
  internalValue.value = item.label;
  emit('update:modelValue', item.label);
  emit('select', item);
  isOpen.value = false;
  highlightedIndex.value = -1;
};

const selectHighlighted = () => {
  if (highlightedIndex.value < 0) return;
  const item = filteredItems.value[highlightedIndex.value];
  if (item) {
    selectItem(item);
  }
};
</script>

<style scoped>
.ui-combobox {
  --ui-combobox-list-margin-block-start: var(--space-2xs);
  --ui-combobox-list-padding: calc(var(--size-base-space-rem) * 0.4);
  --ui-combobox-list-border-width: var(--size-base-layout-px);
  --ui-combobox-list-max-height: calc(var(--size-avatar-hero) * 1.5152);
  --ui-combobox-option-padding-block: calc(var(--size-base-space-rem) * 0.45);
  --ui-combobox-option-padding-inline: var(--space-xs);

  position: relative;
}

.ui-combobox__list {
  position: absolute;
  z-index: 10;
  list-style: none;
  margin: var(--ui-combobox-list-margin-block-start) 0 0;
  padding: var(--ui-combobox-list-padding);
  width: 100%;
  border-radius: var(--radius-md);
  border: var(--ui-combobox-list-border-width) solid var(--color-border-weak);
  background: var(--color-surface-dialog);
  max-height: var(--ui-combobox-list-max-height);
  overflow-y: auto;
}

.ui-combobox__option {
  padding: var(--ui-combobox-option-padding-block) var(--ui-combobox-option-padding-inline);
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-secondary);
}

.ui-combobox__option--active,
.ui-combobox__option:hover {
  background: var(--color-surface-base);
}
</style>
