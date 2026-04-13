<template>
<section class="page-hero u-stack u-stack--section">
  <UiStack :gap="'var(--layout-section-gap)'">
    <UiStack :gap="'var(--space-sm)'">
        <UiText v-if="block.eyebrow" variant="eyebrow">{{ block.eyebrow }}</UiText>
        <UiHeading :level="1" size="display">
          {{ block.title }}
        </UiHeading>
        <UiText v-if="tagline" variant="muted" class="page-hero__tagline">
          {{ tagline }}
        </UiText>
      </UiStack>

      <RichTextRenderer v-if="block.body?.length" :content="block.body" class="page-hero__body" />

      <UiInline v-if="block.ctas?.length" class="page-hero__actions" :gap="'var(--space-sm)'">
        <PageLinkButton
          v-for="cta in block.ctas"
          :key="`${cta.label}-${cta.href}`"
          :cta="cta"
          size="sm"
        />
      </UiInline>
    </UiStack>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { HeroBlock } from '~/modules/api/schemas';
import PageLinkButton from '~/components/PageLinkButton.vue';
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import { richTextToPlainText } from '~/utils/richText';
import { UiHeading, UiInline, UiStack, UiText } from '~/components/ui';

const props = defineProps<{
  block: HeroBlock;
}>();

const tagline = computed(() => richTextToPlainText(props.block.tagline));
</script>

<style scoped>
.page-hero {
  padding-bottom: var(--layout-section-gap);
}

.page-hero__body :deep(p) {
  color: var(--color-text-secondary);
  font-size: calc(var(--size-base-space-rem) * 1.05 * var(--size-scale-factor));
}

.page-hero__tagline {
  max-width: 60ch;
}

.page-hero__actions {
  flex-wrap: wrap;
}
</style>
