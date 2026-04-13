<template>
<UiSurface class="page-crew-roster u-card" variant="panel" :padding="null">
  <UiStack :gap="'var(--layout-section-gap)'">
    <UiStack :gap="'var(--space-sm)'">
        <UiText v-if="block.badge" variant="eyebrow">{{ block.badge }}</UiText>
        <UiHeading :level="2">{{ block.title }}</UiHeading>
        <RichTextRenderer
          v-if="block.description?.length"
          :content="block.description"
          class="page-crew-roster__intro"
        />
      </UiStack>

      <CrewRoster :mode="mode" :limit="limit" />

      <UiInline
        v-if="block.ctas?.length"
        class="page-crew-roster__actions"
        :gap="'var(--space-sm)'"
      >
        <PageLinkButton
          v-for="cta in block.ctas"
          :key="`${cta.label}-${cta.href}`"
          :cta="cta"
          size="sm"
        />
      </UiInline>
    </UiStack>
  </UiSurface>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import CrewRoster from '~/components/CrewRoster.vue';
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import PageLinkButton from '~/components/PageLinkButton.vue';
import type { CrewRosterBlock } from '~/modules/api/schemas';
import { UiHeading, UiInline, UiStack, UiSurface, UiText } from '~/components/ui';

const props = defineProps<{
  block: CrewRosterBlock;
}>();

const mode = computed(() => (props.block.mode === 'preview' ? 'preview' : 'full'));
const limit = computed(() => {
  if (typeof props.block.limit === 'number' && Number.isFinite(props.block.limit)) {
    return Math.max(1, props.block.limit);
  }
  return mode.value === 'preview' ? 6 : 12;
});
</script>

<style scoped>
.page-crew-roster__intro :deep(p) {
  color: var(--color-text-secondary);
  margin: 0;
}
</style>
