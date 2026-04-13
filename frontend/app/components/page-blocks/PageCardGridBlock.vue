<template>
  <section class="page-card-grid">
    <UiStack :gap="'var(--space-lg)'">
      <div v-if="block.title || block.intro?.length" class="page-card-grid__header">
        <UiHeading v-if="block.title" :level="2">{{ block.title }}</UiHeading>
        <RichTextRenderer
          v-if="block.intro?.length"
          :content="block.intro"
          class="page-card-grid__intro"
        />
      </div>

      <UiGrid
        class="page-card-grid__grid"
        :columns="gridConfig.columns"
        :min-column-width="gridConfig.minColumnWidth"
      >
        <UiSurface
          v-for="(card, index) in cards"
          :key="`${card.title}-${index}`"
          variant="panel"
          class="page-card-grid__item"
          :class="cardClasses(card)"
        >
          <UiStack :gap="'var(--space-md)'">
            <UiText v-if="card.badge" variant="eyebrow">{{ card.badge }}</UiText>
            <UiHeading :level="3" size="h4" :uppercase="false">{{ card.title }}</UiHeading>
            <RichTextRenderer
              v-if="card.body?.length"
              :content="card.body"
              class="page-card-grid__body"
            />

            <FlightPlanList
              v-if="card.variant === 'flightPlans'"
              class="page-card-grid__list"
              :limit="card.config?.limit ?? 3"
              :min-role="card.config?.minRole ?? null"
              :empty-label="card.config?.emptyLabel ?? 'No flight plans available yet.'"
            />

            <LogList
              v-else-if="card.variant === 'logs'"
              class="page-card-grid__list"
              :limit="card.config?.limit ?? 3"
              :min-role="card.config?.minRole ?? null"
              :empty-label="card.config?.emptyLabel ?? 'No logs available yet.'"
              :show-composer="false"
            />

            <UiInline
              v-if="card.ctas?.length"
              class="page-card-grid__actions"
              :gap="'var(--space-sm)'"
            >
              <PageLinkButton
                v-for="cta in card.ctas"
                :key="`${cta.label}-${cta.href}`"
                :cta="cta"
                size="sm"
              />
            </UiInline>
          </UiStack>
        </UiSurface>
      </UiGrid>
    </UiStack>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import FlightPlanList from '~/components/FlightPlanList.vue';
import LogList from '~/components/LogList.vue';
import PageLinkButton from '~/components/PageLinkButton.vue';
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import type { CardGridBlock } from '~/modules/api/schemas';
import { UiGrid, UiHeading, UiInline, UiStack, UiSurface, UiText } from '~/components/ui';

const props = defineProps<{
  block: CardGridBlock;
}>();

const cards = computed(() => props.block.cards ?? []);

const cardClasses = (card: CardGridBlock['cards'][number]) => {
  return {
    'page-card-grid__item--full': card.variant === 'flightPlans' || card.variant === 'logs',
  };
};

const minColumnWidthTwo = 'calc(var(--size-base-layout-px) * 260 * var(--size-scale-factor))';
const minColumnWidthThree = 'calc(var(--size-base-layout-px) * 220 * var(--size-scale-factor))';

const gridConfig = computed(() => {
  switch (props.block.columns) {
    case 'one':
      return { columns: 1, minColumnWidth: '100%' };
    case 'two':
      return { columns: null, minColumnWidth: minColumnWidthTwo };
    case 'three':
    default:
      return { columns: null, minColumnWidth: minColumnWidthThree };
  }
});
</script>

<style scoped>
.page-card-grid__header {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.page-card-grid__intro :deep(p) {
  color: var(--color-text-secondary);
  margin: 0;
}

.page-card-grid__grid {
  width: 100%;
}

.page-card-grid__item {
  height: 100%;
}

.page-card-grid__item--full {
  grid-column: 1 / -1;
}

.page-card-grid__body :deep(p) {
  color: var(--color-text-secondary);
  margin: 0;
}

.page-card-grid__list {
  margin-top: var(--space-sm);
}

.page-card-grid__actions {
  flex-wrap: wrap;
}
</style>
