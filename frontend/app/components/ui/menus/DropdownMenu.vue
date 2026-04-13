<template>
  <UiPopover>
    <template #trigger>
      <slot name="trigger" />
    </template>
    <ul class="ui-dropdown">
      <li v-for="item in items" :key="item.label">
        <button type="button" :disabled="item.disabled" @click="handle(item)">
          {{ item.label }}
        </button>
      </li>
    </ul>
  </UiPopover>
</template>

<script setup lang="ts">
import UiPopover from '~/components/ui/overlays/Popover.vue';

type DropdownItem = {
  label: string;
  action: () => void;
  disabled?: boolean;
};

defineProps<{
  items: DropdownItem[];
}>();

const handle = (item: DropdownItem) => {
  if (!item.disabled) {
    item.action();
  }
};
</script>

<style scoped>
.ui-dropdown {
  --ui-dropdown-gap: var(--crew-identity-gap);
  --ui-dropdown-button-pad-y: var(--crew-identity-gap);
  --ui-dropdown-button-pad-x: var(--space-2xs);
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--ui-dropdown-gap);
}

.ui-dropdown button {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--color-text-primary);
  text-align: left;
  padding: var(--ui-dropdown-button-pad-y) var(--ui-dropdown-button-pad-x);
  cursor: pointer;
}
</style>
