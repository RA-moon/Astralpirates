<template>
  <UiStack>
    <UiBreadcrumb :items="items" />
    <UiPagination :current="current" :total="5" @change="(page) => (current = page)" />
  </UiStack>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { UiBreadcrumb, UiPagination, UiStack } from '~/components/ui';

const items = [
  { label: 'Bridge', href: '/bridge' },
  { label: 'Flight plans', href: '/bridge/flight-plans' },
  { label: 'Midnight maintenance window' },
];

const current = ref(1);
</script>
