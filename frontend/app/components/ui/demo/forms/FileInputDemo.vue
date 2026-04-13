<template>
  <UiStack :gap="'var(--space-sm)'">
    <UiHeading :level="3" size="h4" :uppercase="false">File input</UiHeading>
    <UiText variant="muted">
      Token-styled uploader for images or documents. Emits <code>update:modelValue</code> with the selected FileList.
    </UiText>

    <UiFormField label="Upload mission files" hint="PNG, JPG, or PDF up to 5 MB each">
      <template #default="{ id, describedBy }">
        <UiFileInput
          :id="id"
          :described-by="describedBy"
          multiple
          accept=".png,.jpg,.jpeg,.pdf"
          @change="handleChange"
        />
      </template>
    </UiFormField>

    <UiText variant="caption">
      Selected: <strong>{{ fileSummary }}</strong>
    </UiText>
  </UiStack>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { UiFileInput, UiFormField, UiHeading, UiStack, UiText } from '~/components/ui';

const files = ref<FileList | null>(null);

const fileSummary = computed(() => {
  if (!files.value || files.value.length === 0) return 'none';
  const names = Array.from(files.value).map((file) => file.name);
  return names.join(', ');
});

const handleChange = (event: Event) => {
  files.value = (event.target as HTMLInputElement).files;
};
</script>
