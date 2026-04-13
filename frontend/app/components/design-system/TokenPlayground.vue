<template>
  <section class="token-playground u-section">
    <header class="token-playground__header">
      <h1>Design tokens playground</h1>
      <p>Mirrors the input design-system tokens via CSS vars. Buttons/inputs below read directly from them.</p>
    </header>

    <div class="token-playground__grid">
      <UiSurface variant="panel" :padding="null" class="token-playground__card">
        <div class="u-section">
          <UiText variant="eyebrow">Buttons</UiText>
          <div class="token-playground__row">
            <UiButton class="token-playground__button token-playground__button--primary" variant="primary" size="sm">
              Primary
            </UiButton>
            <UiButton class="token-playground__button token-playground__button--secondary" variant="secondary" size="sm">
              Secondary
            </UiButton>
            <UiButton class="token-playground__button token-playground__button--ghost" variant="ghost" size="sm">
              Ghost
            </UiButton>
            <UiButton
              class="token-playground__button token-playground__button--destructive"
              variant="destructive"
              size="sm"
            >
              Destructive
            </UiButton>
          </div>
        </div>
      </UiSurface>

      <UiSurface variant="panel" :padding="null" class="token-playground__card">
        <div class="u-section">
          <UiText variant="eyebrow">Inputs</UiText>
          <div class="token-playground__inputs">
            <UiTextInput
              v-model="sampleInput"
              class="token-playground__input"
              placeholder="Type here"
            />
            <UiTextInput
              v-model="disabledInput"
              class="token-playground__input"
              disabled
              placeholder="Disabled"
            />
          </div>
        </div>
      </UiSurface>

      <UiSurface variant="panel" :padding="null" class="token-playground__card">
        <div class="u-section">
          <UiText variant="eyebrow">Surfaces</UiText>
          <div class="token-playground__swatches">
            <div v-for="swatch in surfaces" :key="swatch.name" class="token-playground__swatch">
              <span class="token-playground__chip" :style="{ background: swatch.value }" />
              <span>{{ swatch.name }}</span>
            </div>
          </div>
        </div>
      </UiSurface>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { UiButton, UiSurface, UiText, UiTextInput } from '~/components/ui';

const surfaces = computed(() => [
  { name: 'Base', value: 'var(--color-surface-base)' },
  { name: 'Panel', value: 'var(--color-surface-panel)' },
  { name: 'Panel strong', value: 'var(--color-surface-panel-strong)' },
  { name: 'Overlay', value: 'var(--color-surface-overlay)' },
  { name: 'Dialog', value: 'var(--color-surface-dialog)' },
]);

const sampleInput = ref('');
const disabledInput = ref('');
</script>

<style scoped>
.token-playground {
  --token-playground-header-margin-top: var(--crew-identity-gap);
  --token-playground-grid-min-column: calc(var(--size-base-layout-px) * 260);
  --token-playground-button-padding-block: var(--space-xs);
  --token-playground-button-padding-inline: calc(var(--size-base-space-rem) * 0.9);
  --token-playground-control-border-width: var(--size-base-layout-px);
  --token-playground-focus-outline-width: calc(var(--size-base-layout-px) * 2);
  --token-playground-focus-outline-offset: calc(var(--size-base-layout-px) * 2);
  --token-playground-input-padding-block: calc(var(--size-base-space-rem) * 0.65);
  --token-playground-input-padding-inline: var(--space-sm);
  --token-playground-chip-width: var(--layout-page-gap);
  --token-playground-chip-height: var(--clip-top);
}

.token-playground__header h1 {
  margin: 0;
}

.token-playground__header p {
  margin: var(--token-playground-header-margin-top) 0 0;
  color: var(--color-text-muted);
}

.token-playground__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(var(--token-playground-grid-min-column), 1fr));
  gap: var(--layout-section-gap);
}

.token-playground__card {
  padding: var(--layout-card-padding);
  border-radius: var(--layout-card-radius);
}

.token-playground__row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.token-playground__button {
  border-radius: var(--radius-pill);
  padding: var(--token-playground-button-padding-block) var(--token-playground-button-padding-inline);
  border: var(--token-playground-control-border-width) solid var(--color-border-weak);
  background: var(--color-surface-panel);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background var(--animation-duration-medium) ease, border-color var(--animation-duration-medium) ease;
}

.token-playground__button--primary {
  background: var(--gradient-button-default);
  border-color: var(--color-border-strong);
}

.token-playground__button--primary:hover,
.token-playground__button--primary:focus-visible {
  background: var(--gradient-button-hover);
  outline: var(--token-playground-focus-outline-width) solid var(--color-border-focus);
  outline-offset: var(--token-playground-focus-outline-offset);
}

.token-playground__button--secondary:hover,
.token-playground__button--ghost:hover,
.token-playground__button--destructive:hover,
.token-playground__button--secondary:focus-visible,
.token-playground__button--ghost:focus-visible,
.token-playground__button--destructive:focus-visible {
  background: var(--color-surface-panel-strong);
  border-color: var(--color-border-strong);
  outline: var(--token-playground-focus-outline-width) solid var(--color-border-focus);
  outline-offset: var(--token-playground-focus-outline-offset);
}

.token-playground__button--ghost {
  background: transparent;
  border-color: transparent;
}

.token-playground__button--destructive {
  background: var(--color-danger);
  border-color: var(--color-danger);
}

.token-playground__inputs {
  display: grid;
  gap: var(--space-sm);
}

.token-playground__input {
  width: 100%;
  border-radius: var(--radius-control);
  padding: var(--token-playground-input-padding-block) var(--token-playground-input-padding-inline);
  border: var(--token-playground-control-border-width) solid var(--color-border-weak);
  background: var(--color-surface-panel);
  color: var(--color-text-primary);
  transition: border-color var(--animation-duration-medium) ease, box-shadow var(--animation-duration-medium) ease;
}

.token-playground__input:focus-visible {
  outline: var(--token-playground-focus-outline-width) solid var(--color-border-focus);
  outline-offset: var(--token-playground-focus-outline-offset);
}

.token-playground__input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.token-playground__swatches {
  display: grid;
  gap: var(--space-sm);
}

.token-playground__swatch {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.token-playground__chip {
  width: var(--token-playground-chip-width);
  height: var(--token-playground-chip-height);
  border-radius: var(--radius-control);
  border: var(--token-playground-control-border-width) solid var(--color-border-weak);
  box-shadow: var(--shadow-card);
}
</style>
