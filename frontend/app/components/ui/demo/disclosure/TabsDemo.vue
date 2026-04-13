<template>
  <UiStack>
    <UiTabs :tabs="tabs" v-model="activeTab">
      <template #panel="{ tab }">
        <p class="ui-demo-tabs__content">
          {{ tab ? (tabContent[tab.value] ?? '') : '' }}
        </p>
      </template>
    </UiTabs>
    <UiCollapsible>
      <template #trigger>Flight checklist</template>
      <ul>
        <li v-for="item in checklist" :key="item">{{ item }}</li>
      </ul>
    </UiCollapsible>
  </UiStack>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { UiTabs, UiCollapsible, UiStack } from '~/components/ui';

const tabs = [
  { label: 'Crew', value: 'crew' },
  { label: 'Public', value: 'public' },
];
const tabContent: Record<string, string> = {
  crew: 'Crew-only updates for the bridge.',
  public: 'Public mission updates posted in the logbook.',
};

const checklist = ['Seal EVA suits', 'Stage tools', 'Confirm comms plan'];
const activeTab = ref(tabs[0]?.value ?? '');
</script>

<style scoped>
.ui-demo-tabs__content {
  margin: 0;
  color: rgba(255, 255, 255, 0.8);
}
</style>
