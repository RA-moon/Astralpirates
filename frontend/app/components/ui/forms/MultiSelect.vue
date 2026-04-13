<template>
  <div class="ui-multi-select" :class="{ 'ui-multi-select--open': isOpen }">
    <UiButton
      ref="triggerRef"
      class="ui-multi-select__trigger"
      variant="secondary"
      @click="toggleMenu"
      :id="triggerId"
      :aria-describedby="describedBy || undefined"
      :aria-haspopup="'listbox'"
      :aria-expanded="isOpen"
      :disabled="isDisabled"
      type="button"
    >
      <span class="ui-multi-select__summary">
        {{ summaryLabel }}
      </span>
      <UiBadge
        v-if="selectedCount"
        class="ui-multi-select__badge"
        :value="selectedCount"
        size="sm"
      />
    </UiButton>

    <transition name="fade">
      <UiSurface
        v-if="isOpen"
        ref="panelRef"
        class="ui-multi-select__panel"
        variant="panel"
        role="listbox"
        :aria-label="label"
      >
        <UiTextInput
          v-if="searchable"
          v-model="searchTerm"
          class="ui-multi-select__search"
          :placeholder="searchPlaceholder"
        />

        <div class="ui-multi-select__options">
          <label
            v-for="option in filteredOptions"
            :key="String(option.value)"
            class="ui-multi-select__option"
          >
            <UiCheckbox
              :model-value="draftValue.includes(option.value)"
              @update:model-value="toggleOption(option.value)"
            >
              {{ option.label }}
            </UiCheckbox>
          </label>
          <p v-if="!filteredOptions.length" class="ui-multi-select__empty">
            No matches
          </p>
        </div>

        <div class="ui-multi-select__actions">
          <UiButton type="button" variant="ghost" size="sm" @click="handleReset">
            {{ resetLabel }}
          </UiButton>
          <UiButton type="button" size="sm" @click="applySelection">
            {{ applyLabel }}
          </UiButton>
        </div>
      </UiSurface>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onClickOutside } from '@vueuse/core';

import UiBadge from '../display/Badge.vue';
import UiButton from '../actions/Button.vue';
import UiCheckbox from './Checkbox.vue';
import UiSurface from '../foundations/Surface.vue';
import UiTextInput from './TextInput.vue';
import { useFormFieldContext } from '~/components/ui/internal/formField';
import { useStableId } from '~/composables/useStableId';

type MultiSelectOption = {
  label: string;
  value: string | number;
  disabled?: boolean;
};

const props = withDefaults(
  defineProps<{
    id?: string;
    describedBy?: string;
    disabled?: boolean;
    label?: string;
    options: MultiSelectOption[];
    modelValue: Array<string | number>;
    placeholder?: string;
    searchable?: boolean;
    searchPlaceholder?: string;
    applyLabel?: string;
    resetLabel?: string;
  }>(),
  {
    id: undefined,
    describedBy: undefined,
    disabled: false,
    label: 'Filter options',
    placeholder: 'All selected',
    searchable: true,
    searchPlaceholder: 'Search…',
    applyLabel: 'Apply',
    resetLabel: 'Clear',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: Array<string | number>];
  change: [value: Array<string | number>];
}>();

const isOpen = ref(false);
const draftValue = ref<Array<string | number>>([...props.modelValue]);
const searchTerm = ref('');
const panelRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLElement | null>(null);
const fieldContext = useFormFieldContext();
const localId = useStableId('ui-multi-select');

const triggerId = computed(() => props.id ?? fieldContext?.id.value ?? localId);
const describedBy = computed(() => props.describedBy ?? fieldContext?.describedBy.value ?? undefined);
const isDisabled = computed(() => fieldContext?.disabled.value ?? props.disabled ?? false);

watch(
  () => props.modelValue,
  (next) => {
    if (!isOpen.value) {
      draftValue.value = [...next];
    }
  },
);

watch(
  isDisabled,
  (next) => {
    if (next && isOpen.value) {
      closeMenu();
    }
  },
  { immediate: true },
);

const normalizedOptions = computed(() => props.options ?? []);

const filteredOptions = computed(() => {
  const term = searchTerm.value.trim().toLowerCase();
  if (!term) return normalizedOptions.value;
  return normalizedOptions.value.filter((option) =>
    option.label.toLowerCase().includes(term),
  );
});

const selectedCount = computed(() => draftValue.value.length);

const summaryLabel = computed(() => {
  if (!draftValue.value.length) return props.placeholder;
  if (draftValue.value.length === 1) {
    const match = normalizedOptions.value.find(
      (option) => option.value === draftValue.value[0],
    );
    return match?.label ?? props.placeholder;
  }
  return `${draftValue.value.length} selected`;
});

const toggleMenu = () => {
  if (isDisabled.value) return;
  if (isOpen.value) {
    closeMenu();
  } else {
    openMenu();
  }
};

const openMenu = () => {
  if (isDisabled.value) return;
  draftValue.value = [...props.modelValue];
  isOpen.value = true;
};

const closeMenu = () => {
  isOpen.value = false;
  searchTerm.value = '';
};

const toggleOption = (value: string | number) => {
  if (draftValue.value.includes(value)) {
    draftValue.value = draftValue.value.filter((entry) => entry !== value);
  } else {
    draftValue.value = [...draftValue.value, value];
  }
};

const applySelection = () => {
  const next = [...draftValue.value];
  emit('update:modelValue', next);
  emit('change', next);
  closeMenu();
};

const handleReset = () => {
  draftValue.value = [];
};

onClickOutside(
  panelRef,
  () => {
    if (isOpen.value) {
      closeMenu();
    }
  },
  {
    ignore: [triggerRef],
  },
);
</script>

<style scoped>
.ui-multi-select {
  --ui-multi-select-panel-offset: calc(var(--size-base-space-rem) * 0.35 * var(--size-scale-factor));
  --ui-multi-select-options-max-height: calc(var(--size-base-layout-px) * 220 * var(--size-scale-factor));
  --ui-multi-select-empty-font-size: calc(var(--size-base-space-rem) * 0.9 * var(--size-scale-factor));
  position: relative;
  display: inline-flex;
  width: 100%;
}

.ui-multi-select__trigger {
  width: 100%;
  justify-content: space-between;
}

.ui-multi-select__badge {
  flex-shrink: 0;
}

.ui-multi-select__panel {
  position: absolute;
  top: calc(100% + var(--ui-multi-select-panel-offset));
  left: 0;
  width: 100%;
  z-index: 10;
  display: grid;
  gap: var(--space-sm);
}

.ui-multi-select__search {
  width: 100%;
}

.ui-multi-select__options {
  max-height: var(--ui-multi-select-options-max-height);
  overflow-y: auto;
  display: grid;
  gap: var(--ui-multi-select-panel-offset);
}

.ui-multi-select__option {
  display: flex;
}

.ui-multi-select__empty {
  margin: 0;
  font-size: var(--ui-multi-select-empty-font-size);
  color: var(--color-text-muted);
}

.ui-multi-select__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.12s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
