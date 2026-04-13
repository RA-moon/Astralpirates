<template>
  <UiSurface class="page-crew-preview" variant="panel">
    <UiStack :gap="'var(--space-lg)'">
      <UiStack :gap="'var(--space-sm)'">
        <UiHeading :level="2">{{ block.title }}</UiHeading>
        <RichTextRenderer
          v-if="block.description?.length"
          :content="block.description"
          class="page-crew-preview__body"
        />
      </UiStack>

      <CrewRoster mode="preview" :limit="block.limit ?? 6" />

      <UiInline
        v-if="block.cta"
        class="page-crew-preview__actions"
        :gap="'var(--space-sm)'"
      >
        <PageLinkButton :cta="block.cta" size="sm" />
      </UiInline>
    </UiStack>
  </UiSurface>
</template>

<script setup lang="ts">
import CrewRoster from '~/components/CrewRoster.vue';
import PageLinkButton from '~/components/PageLinkButton.vue';
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import type { CrewPreviewBlock } from '~/modules/api/schemas';
import { UiHeading, UiInline, UiStack, UiSurface } from '~/components/ui';

defineProps<{
  block: CrewPreviewBlock;
}>();
</script>

<style scoped>
.page-crew-preview__body :deep(p) {
  color: var(--color-text-secondary);
  margin: 0;
}

.page-crew-preview__actions {
  flex-wrap: wrap;
}
</style>
