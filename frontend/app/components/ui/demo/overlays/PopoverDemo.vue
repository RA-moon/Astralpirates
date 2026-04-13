<template>
  <UiStack>
    <UiPopover>
      <template #trigger>
        <UiButton variant="ghost">Open popover</UiButton>
      </template>
      <p>Mission settings, quick actions, etc.</p>
      <UiButtonGroup>
        <UiButton size="sm">Apply</UiButton>
        <UiButton size="sm" variant="secondary">Cancel</UiButton>
      </UiButtonGroup>
    </UiPopover>

    <UiTooltip text="Copy link">
      <UiIconButton aria-label="Copy">⧉</UiIconButton>
    </UiTooltip>

    <UiDropdownMenu :items="menuItems">
      <template #trigger>
        <UiButton variant="secondary">Dropdown</UiButton>
      </template>
    </UiDropdownMenu>

    <UiContextMenu :items="menuItems">
      <div class="ui-demo-context">Right-click this area</div>
    </UiContextMenu>
  </UiStack>
</template>

<script setup lang="ts">
import {
  UiButton,
  UiButtonGroup,
  UiContextMenu,
  UiDropdownMenu,
  UiIconButton,
  UiPopover,
  UiStack,
  UiTooltip,
} from '~/components/ui';

const menuItems = [
  { label: 'Edit', action: () => {} },
  { label: 'Archive', action: () => {} },
];
</script>

<style scoped>
.ui-demo-context {
  padding: 1rem;
  border: 1px dashed rgba(255, 255, 255, 0.3);
}
</style>
