import { useState } from '#app';

const STORAGE_KEY = 'astral-background-enabled';

export const useBackgroundPreference = () => {
  const readStoredValue = (): boolean | null => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === null) return null;
      return stored === 'true';
    } catch {
      return null;
    }
  };

  const writeStoredValue = (value: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
    } catch {
      return;
    }
  };

  const state = useState<boolean>('background-enabled', () => {
    if (!process.client) return true;
    return readStoredValue() ?? true;
  });

  const set = (value: boolean) => {
    state.value = value;
    if (process.client) {
      writeStoredValue(value);
    }
  };

  return {
    enabled: state,
    toggle: () => set(!state.value),
    set,
  };
};
