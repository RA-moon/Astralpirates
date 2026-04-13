<template>
  <UiSurface variant="subtle" class="ui-demo-card">
    <UiHeading :level="4" :uppercase="false" size="h4">Theme controls</UiHeading>
    <UiText variant="muted">
      Toggle between the bundled themes to make sure CSS variable overrides respond instantly. This uses only
      client-side state and never touches the CMS.
    </UiText>
    <UiInline class="ui-demo-card__actions">
      <UiThemeToggle :themes="themes" />
      <button type="button" class="ui-demo-card__ghost" @click="cycle">
        Cycle themes
      </button>
    </UiInline>
  </UiSurface>
</template>

<script setup lang="ts">
import { UiHeading, UiInline, UiSurface, UiText, UiThemeToggle, useTheme } from '~/components/ui';

const themes = ['default', 'retro', 'partner-alpha'];
const { toggleTheme } = useTheme();

const cycle = () => {
  toggleTheme(themes);
};
</script>

<style scoped>
.ui-demo-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.ui-demo-card__actions {
  justify-content: flex-start;
}

.ui-demo-card__ghost {
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-accent-secondary);
  font: inherit;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 0.4rem 0.6rem;
  border-radius: var(--radius-pill);
  cursor: pointer;
}

.ui-demo-card__ghost:hover,
.ui-demo-card__ghost:focus-visible {
  border-color: var(--color-border-panel);
}
</style>
