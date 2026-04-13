import { beforeEach, describe, expect, it } from 'vitest';
import { useBackgroundPreference } from '~/composables/useBackground';

beforeEach(() => {
  (globalThis as any).__mockState = new Map();
  window.localStorage.clear();
  Object.assign(process, { client: true });
});

describe('useBackgroundPreference', () => {
  it('defaults to true when no stored value exists', () => {
    const { enabled } = useBackgroundPreference();
    expect(enabled.value).toBe(true);
  });

  it('persists changes to localStorage', () => {
    const { set, enabled } = useBackgroundPreference();
    set(false);
    expect(enabled.value).toBe(false);
    expect(window.localStorage.getItem('astral-background-enabled')).toBe('false');
  });
});
