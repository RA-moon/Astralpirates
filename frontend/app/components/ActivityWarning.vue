<template>
  <UiModal
    :model-value="visible"
    class="activity-warning-modal"
    :close-on-backdrop="false"
    :close-on-escape="false"
    :show-close="false"
  >
    <div role="status">
      <p class="activity-warning__message">
        You get automatically thrown off ship in {{ countdown }} seconds.
      </p>
      <UiButton type="button" @click="handleStay">
        Stay on deck
      </UiButton>
    </div>
  </UiModal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useActivityTracker } from '~/composables/useActivityTracker';
import { UiButton, UiModal } from '~/components/ui';

const tracker = useActivityTracker();
const visible = computed(() => tracker.warningVisible.value);
const countdown = computed(() => tracker.countdown.value);

const handleStay = () => {
  tracker.stayOnDeck();
};
</script>

<style scoped>
:global(.activity-warning-modal) {
  background: var(--color-surface-overlay);
  z-index: var(--z-overlay-blocking);
}

:global(.activity-warning-modal .ui-modal__panel) {
  --activity-warning-panel-max-width: calc(var(--size-avatar-hero) * 2.7273);
  --activity-warning-panel-fluid-max-width: 90%;
  --activity-warning-panel-border-width: var(--size-base-layout-px);
  --activity-warning-panel-padding: clamp(var(--space-lg), 4%, var(--space-xl));

  max-width: min(var(--activity-warning-panel-max-width), var(--activity-warning-panel-fluid-max-width));
  background: var(--color-surface-dialog);
  border: var(--activity-warning-panel-border-width) solid var(--color-border-weak);
  border-radius: var(--layout-card-radius);
  padding: var(--activity-warning-panel-padding);
  text-align: center;
  box-shadow: var(--shadow-overlay);
}

:global(.activity-warning-modal .ui-modal__body) {
  display: grid;
  gap: var(--size-base-space-rem);
}

.activity-warning__message {
  margin: 0;
  font-size: calc(var(--size-base-space-rem) * 0.95);
  color: var(--color-text-secondary);
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  text-transform: uppercase;
}
</style>
