<template>
  <section class="page-timeline">
    <UiStack :gap="'var(--space-lg)'">
      <div class="page-timeline__header">
        <UiHeading :level="2">{{ block.title }}</UiHeading>
        <RichTextRenderer
          v-if="block.intro?.length"
          :content="block.intro"
          class="page-timeline__intro"
        />
      </div>

      <UiStack class="page-timeline__items" :gap="'var(--space-md)'">
        <UiSurface
          v-for="(item, index) in block.items"
          :key="`${item.heading}-${index}`"
          variant="panel"
          class="page-timeline__item"
        >
          <UiStack :gap="'var(--space-sm)'">
            <UiHeading :level="3" size="h4" :uppercase="false">{{ item.heading }}</UiHeading>
            <UiText v-if="item.timestamp" variant="eyebrow">{{ item.timestamp }}</UiText>
            <RichTextRenderer :content="item.body" class="page-timeline__body" />
          </UiStack>
        </UiSurface>
      </UiStack>
    </UiStack>
  </section>
</template>

<script setup lang="ts">
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import type { TimelineBlock } from '~/modules/api/schemas';
import { UiHeading, UiStack, UiSurface, UiText } from '~/components/ui';

defineProps<{
  block: TimelineBlock;
}>();
</script>

<style scoped>
.page-timeline__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.page-timeline__intro :deep(p) {
  color: var(--color-text-secondary);
  margin: 0;
}

.page-timeline__body :deep(p) {
  color: var(--color-text-secondary);
  margin: 0;
}
</style>
