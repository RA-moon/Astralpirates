import { computed, watch } from 'vue';
import { useHead, useState } from '#imports';

const STORAGE_KEY = 'ui-theme';
const DEFAULT_THEME = 'default';
const BUILT_IN_THEMES = ['default', 'retro', 'partner-alpha'] as const;

declare global {
  interface Window {
    __uiThemeBootstrapped__?: boolean;
  }
}

type ThemeName = (typeof BUILT_IN_THEMES)[number] | string;
type RegisterThemeOptions = {
  replace?: boolean;
};

const applyThemeToDocument = (theme: ThemeName) => {
  if (process.client) {
    document.documentElement.dataset.theme = theme;
  }
};

const readStoredTheme = (): ThemeName | null => {
  if (!process.client) {
    return null;
  }
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const persistTheme = (theme: ThemeName) => {
  if (!process.client) {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // ignore persistence failures (private mode, etc.)
  }
};

export const useTheme = () => {
  const currentTheme = useState<ThemeName>('ui-theme/current', () => DEFAULT_THEME);
  const availableThemes = useState<ThemeName[]>('ui-theme/available', () => [...BUILT_IN_THEMES]);

  if (process.client && !window.__uiThemeBootstrapped__) {
    const stored = readStoredTheme();
    if (stored) {
      currentTheme.value = stored;
    }
    window.__uiThemeBootstrapped__ = true;
  }

  useHead(() => ({
    htmlAttrs: {
      'data-theme': currentTheme.value,
    },
  }));

  watch(
    currentTheme,
    (next) => {
      applyThemeToDocument(next);
      persistTheme(next);
    },
    { immediate: true },
  );

  const setTheme = (theme: ThemeName) => {
    if (!theme) return;
    currentTheme.value = theme;
  };

  const registerThemes = (themes: ThemeName[], options: RegisterThemeOptions = {}) => {
    if (!themes?.length) return;
    const sanitized = themes.filter(Boolean);
    if (!sanitized.length) return;
    const seed = options.replace ? [] : availableThemes.value;
    availableThemes.value = Array.from(new Set([...seed, ...sanitized]));
  };

  const themeOptions = computed(() => availableThemes.value);

  const getNextTheme = (list?: ThemeName[]) => {
    const targets = list?.length ? list : themeOptions.value;
    if (!targets.length) {
      return DEFAULT_THEME;
    }
    const index = targets.indexOf(currentTheme.value);
    const first = targets[0];
    if (index === -1) {
      return first ?? DEFAULT_THEME;
    }
    return targets[(index + 1) % targets.length] ?? first ?? DEFAULT_THEME;
  };

  const toggleTheme = (list?: ThemeName[]) => {
    setTheme(getNextTheme(list));
  };

  return {
    theme: currentTheme,
    availableThemes: themeOptions,
    setTheme,
    registerThemes,
    toggleTheme,
  };
};
