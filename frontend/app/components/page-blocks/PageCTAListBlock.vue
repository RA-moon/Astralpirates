<template>
  <section class="page-cta-list">
    <UiStack :gap="'var(--space-lg)'">
      <div class="page-cta-list__header">
        <UiHeading :level="2">{{ block.title }}</UiHeading>
        <RichTextRenderer
          v-if="block.intro?.length"
          :content="block.intro"
          class="page-cta-list__intro"
        />
      </div>

      <UiGrid class="page-cta-list__grid" :min-column-width="'calc(var(--size-base-layout-px) * 240 * var(--size-scale-factor))'">
        <UiSurface
          v-for="(item, index) in block.items"
          :key="`${item.title}-${index}`"
          variant="panel"
          class="page-cta-list__item"
        >
          <UiStack :gap="'var(--space-md)'">
            <UiHeading :level="3" size="h4" :uppercase="false">{{ item.title }}</UiHeading>
            <RichTextRenderer
              v-if="item.description?.length"
              :content="item.description"
              class="page-cta-list__body"
            />
            <UiInline
              v-if="item.cta"
              class="page-cta-list__actions"
              :gap="'var(--space-sm)'"
            >
              <PageLinkButton :cta="item.cta" size="sm" />
            </UiInline>
          </UiStack>
        </UiSurface>
      </UiGrid>
    </UiStack>
  </section>
</template>

<script setup lang="ts">
import PageLinkButton from '~/components/PageLinkButton.vue';
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import type { CTAListBlock } from '~/modules/api/schemas';
import { UiGrid, UiHeading, UiInline, UiStack, UiSurface } from '~/components/ui';

defineProps<{
  block: CTAListBlock;
}>();

defineOptions({
  name: 'PageCTAListBlock',
});
</script>

<style scoped>
.page-cta-list__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.page-cta-list__intro :deep(p) {
  color: var(--color-text-secondary);
  margin: 0;
}

.page-cta-list__grid {
  width: 100%;
}

.page-cta-list__body :deep(p) {
  color: var(--color-text-secondary);
  margin: 0;
}

.page-cta-list__actions {
  flex-wrap: wrap;
}
</style>
