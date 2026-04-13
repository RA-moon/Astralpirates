<template>
  <UiStack>
    <UiButtonGroup>
      <UiButton @click="modalOpen = true">Open modal</UiButton>
      <UiButton @click="drawerOpen = true" variant="secondary">Open drawer</UiButton>
      <UiButton @click="paletteOpen = true" variant="ghost">Command palette</UiButton>
    </UiButtonGroup>

    <UiModal v-model="modalOpen">
      <template #header>Mission briefing</template>
      <p>Docking rehearsals wrapped ahead of schedule.</p>
      <template #footer>
        <UiButton variant="secondary" @click="modalOpen = false">Close</UiButton>
      </template>
    </UiModal>

    <UiDrawer v-model="drawerOpen">
      <template #header>Drawer</template>
      <p>Use drawers for editing flows (e.g., page editor).</p>
    </UiDrawer>

    <UiCommandPalette v-model="paletteOpen" :commands="commands" />
  </UiStack>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  UiButton,
  UiButtonGroup,
  UiCommandPalette,
  UiDrawer,
  UiModal,
  UiStack,
} from '~/components/ui';

const modalOpen = ref(false);
const drawerOpen = ref(false);
const paletteOpen = ref(false);

const commands = [
  { label: 'Open bridge', action: () => {} },
  { label: 'Navigate to logbook', action: () => {} },
];
</script>
