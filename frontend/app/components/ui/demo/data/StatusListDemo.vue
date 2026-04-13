<template>
  <UiStack class="ui-demo-panel" :gap="'var(--space-lg)'">
    <div>
      <UiHeading :level="3" size="h4" :uppercase="false">Status list</UiHeading>
      <UiText variant="muted">
        Renders roster rows with primary text, muted metadata, and flexible action slots.
      </UiText>
    </div>

    <UiStatusList :items="crewItems" class="ui-demo-status-list">
      <template #primary="{ item }">
        <UiText>{{ item.name }}</UiText>
        <UiText variant="caption" class="ui-demo-status">{{ item.role }}</UiText>
      </template>
      <template #meta="{ item }">
        <UiText variant="caption">
          {{ item.location }} · {{ item.state }}
        </UiText>
      </template>
      <template #actions="{ item }">
        <UiButton
          v-if="item.canPromote"
          size="sm"
          variant="secondary"
          @click="promote(item.id)"
        >
          Promote
        </UiButton>
        <UiButton size="sm" variant="ghost" @click="remove(item.id)">
          Remove
        </UiButton>
      </template>
    </UiStatusList>

    <UiText variant="muted">
      Last action: <strong>{{ lastAction || 'none' }}</strong>
    </UiText>
  </UiStack>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import {
  UiButton,
  UiHeading,
  UiStack,
  UiStatusList,
  UiText,
} from '~/components/ui';

type CrewRow = {
  id: number;
  name: string;
  role: string;
  location: string;
  state: string;
  canPromote: boolean;
};

const crewItems = ref<CrewRow[]>([
  { id: 1, name: 'Nova', role: 'Captain', location: 'Helm', state: 'Online', canPromote: false },
  { id: 2, name: 'Vector', role: 'Helm', location: 'Bridge', state: 'On deck', canPromote: true },
  { id: 3, name: 'Sparrow', role: 'Engineering', location: 'Hangar', state: 'Offline', canPromote: true },
]);

const lastAction = ref('');

const promote = (id: number) => {
  lastAction.value = `Promote crew #${id}`;
};

const remove = (id: number) => {
  lastAction.value = `Remove crew #${id}`;
};
</script>

<style scoped>
.ui-demo-panel {
  padding: var(--space-lg);
  border: 1px solid var(--color-border-panel);
  border-radius: var(--radius-lg);
  background: rgba(255, 255, 255, 0.03);
}

.ui-demo-status-list :deep(.ui-status-list__item) {
  background: rgba(255, 255, 255, 0.02);
}

.ui-demo-status {
  display: block;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
</style>
