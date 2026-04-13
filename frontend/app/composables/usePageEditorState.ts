import { computed } from 'vue';
import { useState } from '#imports';

import type { PageDocument } from '~/modules/api/schemas';

const clone = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // fall through to JSON clone
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

export const usePageEditorState = () => {
  const isOpen = useState<boolean>('page-editor/open', () => false);
  const draft = useState<PageDocument | null>('page-editor/draft', () => null);
  const original = useState<PageDocument | null>('page-editor/original', () => null);
  const saving = useState<boolean>('page-editor/saving', () => false);
  const errorMessage = useState<string | null>('page-editor/error', () => null);

  const hasChanges = computed(() => {
    if (!draft.value || !original.value) return false;
    try {
      return JSON.stringify(draft.value) !== JSON.stringify(original.value);
    } catch {
      return true;
    }
  });

  const openEditor = (page: PageDocument) => {
    original.value = clone(page);
    draft.value = clone(page);
    errorMessage.value = null;
    isOpen.value = true;
  };

  const closeEditor = () => {
    isOpen.value = false;
    draft.value = null;
    original.value = null;
    saving.value = false;
    errorMessage.value = null;
  };

  const resetDraft = () => {
    if (!original.value) return;
    draft.value = clone(original.value);
    errorMessage.value = null;
  };

  const setSaving = (value: boolean) => {
    saving.value = value;
  };

  const setError = (message: string | null) => {
    errorMessage.value = message;
  };

  return {
    isOpen,
    draft,
    original,
    saving,
    errorMessage,
    hasChanges,
    openEditor,
    closeEditor,
    resetDraft,
    setSaving,
    setError,
  };
};
