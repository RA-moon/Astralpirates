<template>
  <UiStack class="ui-demo-panel" :gap="'var(--space-lg)'">
    <div>
      <UiHeading :level="3" size="h4" :uppercase="false">Crew roles</UiHeading>
      <UiText variant="muted">
        Use the multi-select to filter crew manifest data. Selections are staged until you hit “Apply”.
      </UiText>
    </div>

    <UiMultiSelect
      v-model="selectedRoles"
      :options="roleOptions"
      placeholder="All roles"
    />

    <UiInline v-if="selectedRoles.length" :gap="'var(--space-xs)'" class="ui-demo-tags">
      <UiTag
        v-for="role in selectedRoles"
        :key="role"
        closable
        :close-label="`Remove ${role}`"
        @close="removeRole(role)"
      >
        {{ role }}
      </UiTag>
    </UiInline>
    <UiText v-else variant="muted">No role filters applied.</UiText>
  </UiStack>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { UiHeading, UiInline, UiMultiSelect, UiStack, UiTag, UiText } from '~/components/ui';

const roleOptions = [
  { label: 'Captain', value: 'captain' },
  { label: 'Helm', value: 'helm' },
  { label: 'Operations', value: 'operations' },
  { label: 'Engineering', value: 'engineering' },
  { label: 'Quartermaster', value: 'quartermaster' },
  { label: 'Deck crew', value: 'deck' },
];

const selectedRoles = ref<string[]>(['captain']);

const removeRole = (role: string) => {
  selectedRoles.value = selectedRoles.value.filter((entry) => entry !== role);
};
</script>

<style scoped>
.ui-demo-panel {
  padding: var(--space-lg);
  border: 1px solid var(--color-border-panel);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.03);
}

.ui-demo-tags {
  flex-wrap: wrap;
}
</style>
