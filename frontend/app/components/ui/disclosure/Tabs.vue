<template>
  <div class="ui-tabs">
    <div class="ui-tabs__list" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        type="button"
        class="ui-tabs__trigger"
        :class="{ 'ui-tabs__trigger--active': tab.value === activeTab }"
        role="tab"
        :aria-selected="tab.value === activeTab"
        @click="select(tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="ui-tabs__panels">
      <slot name="panel" :tab="currentTab" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

export type TabOption = {
  label: string;
  value: string;
};

const props = withDefaults(
  defineProps<{
    tabs?: TabOption[];
    modelValue?: string;
  }>(),
  {
    tabs: () => [],
    modelValue: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const internalValue = ref(props.modelValue ?? props.tabs[0]?.value ?? '');

watch(
  () => props.modelValue,
  (next) => {
    if (typeof next === 'string') {
      internalValue.value = next;
    }
  },
);

const activeTab = computed(() => internalValue.value);
const currentTab = computed(() => props.tabs.find((tab) => tab.value === activeTab.value));

const select = (value: string) => {
  internalValue.value = value;
  emit('update:modelValue', value);
};
</script>

<style scoped>
.ui-tabs__list {
  --ui-tabs-gap: var(--space-xs);
  --ui-tabs-border-width: var(--size-base-layout-px);
  --ui-tabs-trigger-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --ui-tabs-trigger-padding-block: var(--space-xs);
  --ui-tabs-trigger-padding-inline: var(--space-sm);
  --ui-tabs-active-border-width: calc(var(--size-base-layout-px) * 2);
  --ui-tabs-panels-padding-block: var(--size-base-space-rem);

  display: inline-flex;
  gap: var(--ui-tabs-gap);
  border-bottom: var(--ui-tabs-border-width) solid var(--color-border-weak);
}

.ui-tabs__trigger {
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font: inherit;
  text-transform: uppercase;
  letter-spacing: var(--ui-tabs-trigger-letter-spacing);
  padding: var(--ui-tabs-trigger-padding-block) var(--ui-tabs-trigger-padding-inline);
  cursor: pointer;
}

.ui-tabs__trigger--active {
  color: var(--color-text-primary);
  border-bottom: var(--ui-tabs-active-border-width) solid var(--color-accent-secondary);
}

.ui-tabs__panels {
  padding: var(--ui-tabs-panels-padding-block) 0;
}
</style>
