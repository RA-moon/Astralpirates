<template>
  <div class="editable-rich-text">
    <UiFormField :label="computedLabel" :hide-label="!label">
      <template #default="{ id, describedBy }">
        <UiTextArea
          v-model="text"
          :rows="rows"
          :id="id"
          :described-by="describedBy"
          :placeholder="placeholder ?? defaultPlaceholder"
        />
      </template>
      <template #description>
        Separate paragraphs with a blank line. Prefix lines with
        <code>- </code> for bullet lists or <code>1. </code> for numbered lists.
      </template>
    </UiFormField>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';

import type { RichTextContent } from '~/modules/api/schemas';
import { editorStringToRichText, richTextToEditorString } from '~/utils/richText';
import { UiFormField, UiTextArea } from '~/components/ui';

const props = defineProps<{
  modelValue?: RichTextContent | null;
  label?: string;
  placeholder?: string;
  rows?: number;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: RichTextContent): void;
}>();

const defaultPlaceholder =
  'Write text here. Leave a blank line between paragraphs. Use "- Item" for lists.';

const text = ref(richTextToEditorString(props.modelValue ?? []));

watch(
  () => props.modelValue,
  (value) => {
    const next = richTextToEditorString(value ?? []);
    if (next !== text.value) {
      text.value = next;
    }
  },
  { deep: true },
);

watch(
  () => text.value,
  (value) => {
    emit('update:modelValue', editorStringToRichText(value));
  },
);

const rows = computed(() => props.rows ?? 4);
const computedLabel = computed(() => props.label ?? 'Rich text content');
</script>

<style scoped>
.editable-rich-text {
  --editable-rich-text-code-pad-y: calc(var(--size-base-space-rem) * 0.1 * var(--size-scale-factor));
  --editable-rich-text-code-pad-x: var(--crew-identity-gap);
  --editable-rich-text-code-radius: calc(var(--size-base-space-rem) * 0.2 * var(--size-scale-factor));
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.editable-rich-text :deep(code) {
  font-family: inherit;
  background: var(--color-surface-base);
  padding: var(--editable-rich-text-code-pad-y) var(--editable-rich-text-code-pad-x);
  border-radius: var(--editable-rich-text-code-radius);
}
</style>
