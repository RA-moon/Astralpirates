<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div v-if="markup" class="rich-text" v-html="markup" />
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { RichTextContent } from '~/modules/api/schemas';
import { renderRichText } from '~/utils/richText';

const props = defineProps<{
  content?: RichTextContent | null;
}>();

const markup = computed(() => renderRichText(props.content ?? []));
</script>

<style scoped>
.rich-text :deep(p) {
  --rich-text-paragraph-margin-block-end: var(--size-base-space-rem);
  --rich-text-list-padding-inline-start: var(--space-lg);
  --rich-text-columns-gap: var(--status-toggle-indent-base);
  --rich-text-columns-margin-block: var(--space-lg);
  --rich-text-columns-min-width: calc(var(--size-avatar-hero) * 1.6667);
  --rich-text-column-title-margin-block-end: var(--space-sm);
  --rich-text-list-item-margin-block-end: var(--crew-identity-gap);

  margin: 0 0 var(--rich-text-paragraph-margin-block-end);
  line-height: 1.7;
}

.rich-text :deep(p:last-child) {
  margin-bottom: 0;
}

.rich-text :deep(ul) {
  margin: 0 0 var(--rich-text-paragraph-margin-block-end);
  padding-left: var(--rich-text-list-padding-inline-start);
}

.rich-text :deep(.rich-text__columns) {
  display: grid;
  gap: var(--rich-text-columns-gap);
  margin: var(--rich-text-columns-margin-block) 0;
  grid-template-columns: repeat(auto-fit, minmax(var(--rich-text-columns-min-width), 1fr));
}

.rich-text :deep(.rich-text__column ul) {
  margin-bottom: 0;
}

.rich-text :deep(.rich-text__column h4) {
  margin-bottom: var(--rich-text-column-title-margin-block-end);
}

.rich-text :deep(li) {
  margin-bottom: var(--rich-text-list-item-margin-block-end);
  line-height: 1.6;
}
</style>
