<template>
  <UiStack class="ui-demo-panel" :gap="'var(--space-md)'">
    <div>
      <UiHeading :level="3" size="h4" :uppercase="false">Tag / Chip tokens</UiHeading>
      <UiText variant="muted">
        Tags inherit the pill radius + border tokens. Use the closable variant for filters or removable items.
      </UiText>
    </div>

    <UiInline :gap="'var(--space-xs)'" class="ui-demo-tags">
      <UiTag>Primary tag</UiTag>
      <UiTag variant="muted">Muted tag</UiTag>
      <UiTag closable close-label="Remove filter" @close="onClose">Closable tag</UiTag>
      <UiTag closable close-label="Remove retro" @close="removePreset('retro')">
        Retro palette
      </UiTag>
    </UiInline>

    <UiText variant="muted">
      Closed tags: <strong>{{ closedLabels.join(', ') || 'none' }}</strong>
    </UiText>
  </UiStack>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { UiHeading, UiInline, UiStack, UiTag, UiText } from '~/components/ui';

const closedLabels = ref<string[]>([]);

const onClose = () => {
  closedLabels.value = [...closedLabels.value, 'Closable tag'];
};

const removePreset = (label: string) => () => {
  closedLabels.value = [...closedLabels.value, label];
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
