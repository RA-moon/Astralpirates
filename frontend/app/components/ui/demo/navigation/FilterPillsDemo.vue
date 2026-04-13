<template>
  <UiStack>
    <UiFilterPills :pills="pills" v-model="active" />
    <p class="ui-demo-filter-desc">Active filter: {{ active }}</p>
  </UiStack>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { UiFilterPills, UiStack } from '~/components/ui';

const pills = [
  { label: 'All crew', value: 'all', badge: 128, badgeLabel: '128 crew total' },
  { label: 'Captains', value: 'captain', badge: 6, badgeLabel: 'Six captains' },
  { label: 'Navigators', value: 'navigator', badge: 18, badgeLabel: 'Eighteen navigators' },
  { label: 'Grounded', value: 'grounded', badge: 0, badgeLabel: 'No grounded crew', disabled: true },
];

const active = ref('all');
</script>

<style scoped>
.ui-demo-filter-desc {
  margin: 0;
}
</style>
