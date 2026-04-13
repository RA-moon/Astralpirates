<template>
  <div v-if="visible" class="page-edit-toggle">
    <UiButton
      type="button"
      variant="secondary"
      class="page-edit-toggle__button"
      aria-label="Edit page"
      @click="openEditor"
    >
      <span class="page-edit-toggle__icon" aria-hidden="true">✎</span>
      <span class="page-edit-toggle__label">Edit page</span>
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import type { PageDocument } from '~/modules/api/schemas';
import { usePageEditorState } from '~/composables/usePageEditorState';
import { usePageEditingPermissions } from '~/composables/usePageEditingPermissions';
import { UiButton } from '~/components/ui';

const props = defineProps<{
  pageData: PageDocument | null;
}>();

const editor = usePageEditorState();
const permissions = usePageEditingPermissions(() => props.pageData ?? null);
const hydrated = ref(false);

onMounted(() => {
  hydrated.value = true;
});

const visible = computed(() => {
  if (!hydrated.value) return false;
  if (!permissions.isReady.value) return false;
  if (!permissions.canEdit.value) return false;
  return Boolean(props.pageData);
});

const openEditor = () => {
  if (!props.pageData) return;
  editor.openEditor(props.pageData);
};
</script>

<style scoped>
.page-edit-toggle {
  --page-edit-toggle-right-max: var(--space-xl);
  --page-edit-toggle-right-fluid: 4%;
  --page-edit-toggle-button-gap: calc(var(--size-base-space-rem) * 0.65);
  --page-edit-toggle-button-padding-block: calc(var(--size-base-space-rem) * 0.85);
  --page-edit-toggle-button-padding-inline: var(--space-md);
  --page-edit-toggle-button-radius: var(--radius-pill);
  --page-edit-toggle-button-border-width: var(--size-base-layout-px);
  --page-edit-toggle-button-font-size: calc(var(--size-base-space-rem) * 0.95);
  --page-edit-toggle-focus-outline-width: calc(var(--size-base-layout-px) * 2);
  --page-edit-toggle-focus-outline-offset: calc(var(--size-base-layout-px) * 4);
  --page-edit-toggle-icon-size: var(--space-md);
  --page-edit-toggle-mobile-bottom: var(--space-lg);
  --page-edit-toggle-mobile-padding-block: var(--space-sm);
  --page-edit-toggle-mobile-padding-inline: calc(var(--size-base-space-rem) * 0.9);
  --page-edit-toggle-mobile-gap: var(--space-xs);

  position: fixed;
  top: 50%;
  right: min(var(--page-edit-toggle-right-max), var(--page-edit-toggle-right-fluid));
  transform: translateY(-50%);
  z-index: 1200;
  display: flex;
}

.page-edit-toggle__button {
  display: inline-flex;
  align-items: center;
  gap: var(--page-edit-toggle-button-gap);
  padding: var(--page-edit-toggle-button-padding-block) var(--page-edit-toggle-button-padding-inline);
  border-radius: var(--page-edit-toggle-button-radius);
  border: var(--page-edit-toggle-button-border-width) solid var(--color-border-weak);
  background: var(--color-surface-overlay);
  color: var(--color-text-primary);
  cursor: pointer;
  font-size: var(--page-edit-toggle-button-font-size);
  box-shadow: var(--shadow-overlay);
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.page-edit-toggle__button:hover,
.page-edit-toggle__button:focus-visible {
  transform: scale(1.04);
  box-shadow: var(--shadow-overlay);
  background: var(--color-surface-dialog);
}

.page-edit-toggle__button:focus-visible {
  outline: var(--page-edit-toggle-focus-outline-width) solid var(--color-border-focus);
  outline-offset: var(--page-edit-toggle-focus-outline-offset);
}

.page-edit-toggle__icon {
  font-size: var(--page-edit-toggle-icon-size);
  line-height: 1;
}

.page-edit-toggle__label {
  font-weight: 600;
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  text-transform: uppercase;
}

@media (--bp-max-lg) {
  .page-edit-toggle {
    top: auto;
    bottom: var(--page-edit-toggle-mobile-bottom);
    transform: none;
  }

  .page-edit-toggle__button {
    padding: var(--page-edit-toggle-mobile-padding-block) var(--page-edit-toggle-mobile-padding-inline);
    gap: var(--page-edit-toggle-mobile-gap);
  }

  .page-edit-toggle__label {
    display: none;
  }
}
</style>
