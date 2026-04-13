<template>
<section class="page-stat-grid u-section">
  <UiStack :gap="'var(--layout-section-gap)'">
      <div class="page-stat-grid__header">
        <UiHeading :level="2">{{ block.title }}</UiHeading>
        <RichTextRenderer
          v-if="block.intro?.length"
          :content="block.intro"
          class="page-stat-grid__intro"
        />
      </div>

      <UiGrid class="page-stat-grid__grid" :min-column-width="'calc(var(--size-base-layout-px) * 180 * var(--size-scale-factor))'">
        <UiSurface
          v-for="(stat, index) in stats"
          :key="`${stat.label}-${index}`"
          variant="card"
          borderless
          class="page-stat-grid__item"
        >
          <UiStack :gap="'var(--space-xs)'" align="center">
            <UiHeading :level="3" size="h2">{{ stat.value }}</UiHeading>
            <UiText variant="caption">{{ stat.label }}</UiText>
          </UiStack>
        </UiSurface>
      </UiGrid>

      <UiInline
        v-if="block.ctas?.length"
        class="page-stat-grid__actions"
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
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import PageLinkButton from '~/components/PageLinkButton.vue';
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import type { StatGridBlock } from '~/modules/api/schemas';
import { UiGrid, UiHeading, UiInline, UiStack, UiSurface, UiText } from '~/components/ui';

const props = defineProps<{
  block: StatGridBlock;
}>();

const stats = computed(() => props.block.stats ?? []);
</script>

<style scoped>
.page-stat-grid__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.page-stat-grid__intro :deep(p) {
  color: var(--color-text-secondary);
  margin: 0;
}

.page-stat-grid__grid {
  width: 100%;
}

.page-stat-grid__item {
  text-align: center;
  border: var(--size-base-layout-px) solid var(--color-border-weak);
  border-radius: var(--layout-card-radius);
  padding: var(--layout-card-padding);
}

.page-stat-grid__item :deep(.ui-heading) {
  letter-spacing: var(--crew-identity-meta-letter-spacing);
}

.page-stat-grid__actions {
  flex-wrap: wrap;
  justify-content: center;
}
</style>
