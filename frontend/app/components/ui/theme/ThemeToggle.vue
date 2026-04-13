<template>
  <button
    type="button"
    class="ui-theme-toggle"
    :aria-label="computedLabel"
    @click="() => toggleTheme(options)"
  >
    <slot :current="theme" :next="nextTheme">
      <span class="ui-theme-toggle__text">
        {{ themeLabel }}
      </span>
    </slot>
  </button>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { useTheme } from '~/composables/useTheme';

const props = withDefaults(
  defineProps<{
    themes?: string[];
    srLabel?: string;
  }>(),
  {
    themes: () => [],
    srLabel: '',
  },
);

const { theme, availableThemes, toggleTheme, registerThemes } = useTheme();

watchEffect(() => {
  if (props.themes?.length) {
    registerThemes(props.themes);
  }
});

const options = computed(() => (props.themes?.length ? props.themes : availableThemes.value));

const nextTheme = computed(() => {
  const list = options.value;
  if (!list.length) return theme.value;
  const index = list.indexOf(theme.value);
  if (index === -1) {
    return list[0];
  }
  return list[(index + 1) % list.length] ?? list[0];
});

const formatTheme = (value?: string) =>
  (value ?? 'default').replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

const themeLabel = computed(() => `Theme: ${formatTheme(theme.value)}`);

const computedLabel = computed(() => {
  if (props.srLabel) {
    return props.srLabel;
  }
  return `Switch theme. Next: ${formatTheme(nextTheme.value)}`;
});
</script>

<style scoped>
.ui-theme-toggle {
  --ui-theme-toggle-border-width: var(--size-base-layout-px);
  --ui-theme-toggle-padding-block: var(--crew-identity-gap);
  --ui-theme-toggle-padding-inline: calc(var(--size-base-space-rem) * 0.9);
  --ui-theme-toggle-gap: calc(var(--size-base-space-rem) * 0.4);
  --ui-theme-toggle-text-font-size: calc(var(--size-base-space-rem) * 0.8);
  --ui-theme-toggle-text-letter-spacing: var(--crew-identity-meta-letter-spacing);

  border: var(--ui-theme-toggle-border-width) solid var(--color-border-weak);
  border-radius: var(--radius-pill);
  background: var(--color-button-secondary-background);
  color: var(--color-text-primary);
  font: inherit;
  padding: var(--ui-theme-toggle-padding-block) var(--ui-theme-toggle-padding-inline);
  display: inline-flex;
  align-items: center;
  gap: var(--ui-theme-toggle-gap);
  cursor: pointer;
  transition:
    border-color var(--transition-duration-base) var(--transition-ease-standard),
    background var(--transition-duration-base) var(--transition-ease-standard);
}

.ui-theme-toggle:hover,
.ui-theme-toggle:focus-visible {
  border-color: var(--color-button-border-hover);
  background: var(--gradient-button-default);
}

.ui-theme-toggle__text {
  font-size: var(--ui-theme-toggle-text-font-size);
  letter-spacing: var(--ui-theme-toggle-text-letter-spacing);
  text-transform: uppercase;
}
</style>
