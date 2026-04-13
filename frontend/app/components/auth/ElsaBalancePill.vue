<template>
  <div
    v-if="shouldShow"
    class="elsa-pill"
    :data-status="pillStatus"
    :aria-busy="pillStatus === 'loading'"
  >
    <NuxtLink
      class="elsa-pill__link"
      to="/gangway/lair"
      aria-label="Open the lair to review your E.L.S.A. tokens"
      @focus="refreshBalance({ silent: true })"
      @mouseenter="refreshBalance({ silent: true })"
    >
      <span class="elsa-pill__label">E.L.S.A.</span>
      <span class="elsa-pill__value" :data-loading="pillStatus === 'loading'">
        <span v-if="pillStatus === 'loading'">…</span>
        <span v-else>{{ elsaBalance }}</span>
      </span>
      <span class="elsa-pill__cta">Lair</span>
    </NuxtLink>
    <UiButton
      v-if="pillStatus === 'error'"
      type="button"
      variant="ghost"
      size="sm"
      class="elsa-pill__retry"
      @click="refreshBalance({ force: true, silent: false })"
    >
      Retry
    </UiButton>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute } from '#imports';
import { useInviteStatus } from '~/composables/useInviteStatus';
import { UiButton } from '~/components/ui';
import { useSessionStore } from '~/stores/session';

const session = useSessionStore();
const route = useRoute();
const { elsaBalance, status, hydrateStatus } = useInviteStatus();

if (!session.initialised) {
  session.initialiseFromStorage();
}

const shouldShow = computed(() => session.initialised && session.isAuthenticated);
const pillStatus = computed(() => {
  if (!shouldShow.value) return 'hidden';
  if (status.value === 'loading') return 'loading';
  if (status.value === 'error') return 'error';
  return 'ready';
});

let refreshTimer: ReturnType<typeof setInterval> | null = null;

const refreshBalance = async ({
  force = false,
  silent = true,
}: { force?: boolean; silent?: boolean } = {}) => {
  if (!shouldShow.value) return;
  await hydrateStatus({ silent, force, retry: 1 });
};

const startTimer = () => {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    refreshBalance({ silent: true });
  }, 60_000);
};

const stopTimer = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
};

onMounted(() => {
  if (shouldShow.value) {
    refreshBalance({ force: true, silent: false });
    startTimer();
  }
  if (process.client) {
    const handleFocus = () => refreshBalance({ silent: true });
    window.addEventListener('focus', handleFocus);
    onBeforeUnmount(() => {
      window.removeEventListener('focus', handleFocus);
    });
  }
});

onBeforeUnmount(() => {
  stopTimer();
});

watch(
  () => session.isAuthenticated,
  (isAuthed) => {
    if (isAuthed) {
      refreshBalance({ force: true, silent: false });
      startTimer();
    } else {
      stopTimer();
    }
  },
  { immediate: true },
);

watch(
  () => route.fullPath,
  () => {
    if (shouldShow.value) {
      refreshBalance({ silent: true });
    }
  },
);
</script>

<style scoped>
.elsa-pill {
  --elsa-pill-gap: var(--space-2xs);
  --elsa-pill-padding-block: var(--space-sm);
  --elsa-pill-padding-inline: calc(var(--size-base-space-rem) * 0.9);
  --elsa-pill-radius: var(--radius-pill);
  --elsa-pill-border-width: var(--size-base-layout-px);
  --elsa-pill-min-width: calc(var(--size-base-layout-px) * 180);
  --elsa-pill-link-gap: calc(var(--size-base-space-rem) * 0.6);
  --elsa-pill-label-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 1.25);
  --elsa-pill-label-size: var(--space-sm);
  --elsa-pill-value-size: calc(var(--size-base-space-rem) * 1.25);
  --elsa-pill-cta-size: calc(var(--size-base-space-rem) * 0.85);
  --elsa-pill-cta-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --elsa-pill-retry-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --elsa-pill-retry-size: var(--space-sm);
  --elsa-pill-min-width-mobile: calc(var(--size-base-layout-px) * 160);

  display: inline-flex;
  flex-direction: column;
  gap: var(--elsa-pill-gap);
  padding: var(--elsa-pill-padding-block) var(--elsa-pill-padding-inline);
  border-radius: var(--elsa-pill-radius);
  border: var(--elsa-pill-border-width) solid var(--color-border-weak);
  background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.08),
      rgba(255, 255, 255, 0.02)
    ),
    var(--color-surface-overlay);
  box-shadow: var(--shadow-card);
  min-width: var(--elsa-pill-min-width);
  align-items: flex-start;
}

.elsa-pill__link {
  display: inline-flex;
  align-items: center;
  gap: var(--elsa-pill-link-gap);
  text-decoration: none;
  color: var(--color-text-primary);
}

.elsa-pill__label {
  text-transform: uppercase;
  letter-spacing: var(--elsa-pill-label-letter-spacing);
  font-size: var(--elsa-pill-label-size);
  color: var(--color-text-secondary);
}

.elsa-pill__value {
  font-weight: 700;
  font-size: var(--elsa-pill-value-size);
  min-width: 2.5ch;
  text-align: center;
}

.elsa-pill__value[data-loading='true'] {
  color: var(--color-text-secondary);
}

.elsa-pill__cta {
  font-size: var(--elsa-pill-cta-size);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--elsa-pill-cta-letter-spacing);
}

.elsa-pill__retry {
  align-self: flex-end;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--elsa-pill-retry-letter-spacing);
  font-size: var(--elsa-pill-retry-size);
  cursor: pointer;
  padding: 0;
}

.elsa-pill__retry:hover,
.elsa-pill__retry:focus-visible {
  color: var(--color-text-primary);
  text-decoration: underline;
}

@media (--bp-max-lg) {
  .elsa-pill {
    min-width: var(--elsa-pill-min-width-mobile);
  }
}
</style>
