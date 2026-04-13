<template>
  <UiAccordion :items="items" multiple />
</template>

<script setup lang="ts">
import { UiAccordion } from '~/components/ui';

const items = [
  {
    id: 'mission',
    title: 'Mission summary',
    content: 'Hot-swap starboard relays and reroute backup power during the midnight window.',
  },
  {
    id: 'checklist',
    title: 'Pre-flight checklist',
    list: ['Confirm EVA seals', 'Stage tools near hangar', 'Sync comms codes'],
  },
];
</script>
