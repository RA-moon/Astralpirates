<template>
  <div class="link-editor-row">
    <UiFormField label="Label" :required="true">
      <template #default="{ id, describedBy }">
        <UiTextInput
          v-model="local.label"
          :id="id"
          :described-by="describedBy"
          placeholder="CTA label"
        />
      </template>
    </UiFormField>
    <UiFormField label="URL" :required="true">
      <template #default="{ id, describedBy }">
        <UiTextInput
          v-model="local.href"
          :id="id"
          :described-by="describedBy"
          placeholder="https://"
        />
      </template>
    </UiFormField>
    <UiFormField v-if="allowStyle" label="Style">
      <template #default="{ id, describedBy }">
        <UiSelect
          v-model="local.style"
          :id="id"
          :described-by="describedBy"
          :options="styleOptions"
        />
      </template>
    </UiFormField>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import type { Link } from '~/modules/api/schemas';
import { UiFormField, UiSelect, UiTextInput } from '~/components/ui';

const props = defineProps<{
  modelValue: Link;
  allowStyle?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: Link): void;
}>();

const local = computed({
  get: () => props.modelValue,
  set: (next: Link) => {
    emit('update:modelValue', {
      ...next,
      label: next.label ?? '',
      href: next.href ?? '',
      style: (next.style as Link['style']) ?? 'primary',
    });
  },
});

const allowStyle = computed(() => props.allowStyle ?? true);

const styleOptions = [
  { label: 'Primary', value: 'primary' },
  { label: 'Secondary', value: 'secondary' },
  { label: 'Link', value: 'link' },
];
</script>

<style scoped>
.link-editor-row {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(auto-fit, minmax(calc(var(--size-base-layout-px) * 160 * var(--size-scale-factor)), 1fr));
}
</style>
