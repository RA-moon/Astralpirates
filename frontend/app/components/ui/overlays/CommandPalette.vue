<template>
  <UiModal
    :model-value="modelValue"
    :close-on-backdrop="true"
    :close-aria-label="closeLabel"
    close-button-test-id="command-palette-close"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #header>
      <h3>Command palette</h3>
    </template>
    <div class="ui-command-palette">
      <input
        type="search"
        v-model="query"
        class="ui-command-palette__search"
        placeholder="Search commands…"
      />
      <ul class="ui-command-palette__list">
        <li v-for="item in filtered" :key="item.label">
          <button type="button" @click="run(item)">{{ item.label }}</button>
        </li>
      </ul>
    </div>
  </UiModal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import UiModal from '~/components/ui/overlays/Modal.vue';

type CommandItem = {
  label: string;
  action: () => void;
};

const props = defineProps<{
  modelValue: boolean;
  commands: CommandItem[];
  closeLabel?: string;
}>();

defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const query = ref('');
const closeLabel = computed(() => props.closeLabel ?? 'Close command palette');
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return props.commands;
  return props.commands.filter((command) => command.label.toLowerCase().includes(q));
});

const run = (item: CommandItem) => {
  item.action();
};
</script>

<style scoped>
.ui-command-palette {
  --ui-command-palette-gap: var(--space-sm);
  --ui-command-palette-search-padding-block: calc(var(--size-base-space-rem) * 0.65);
  --ui-command-palette-search-padding-inline: var(--space-sm);
  --ui-command-palette-search-border-width: var(--size-base-layout-px);
  --ui-command-palette-list-gap: calc(var(--size-base-space-rem) * 0.4);
  --ui-command-palette-item-padding-block: calc(var(--size-base-space-rem) * 0.45);
  --ui-command-palette-item-padding-inline: calc(var(--size-base-space-rem) * 0.6);

  display: flex;
  flex-direction: column;
  gap: var(--ui-command-palette-gap);
}

.ui-command-palette__search {
  width: 100%;
  padding: var(--ui-command-palette-search-padding-block) var(--ui-command-palette-search-padding-inline);
  border-radius: var(--radius-control);
  border: var(--ui-command-palette-search-border-width) solid var(--color-border-weak);
  background: var(--color-surface-overlay);
  color: var(--color-text-primary);
}

.ui-command-palette__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--ui-command-palette-list-gap);
}

.ui-command-palette__list button {
  width: 100%;
  border: none;
  background: var(--color-surface-overlay);
  color: var(--color-text-primary);
  text-align: left;
  padding: var(--ui-command-palette-item-padding-block) var(--ui-command-palette-item-padding-inline);
  cursor: pointer;
}
</style>
