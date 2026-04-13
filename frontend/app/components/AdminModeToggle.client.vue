<template>
  <aside
    v-if="visible"
    class="admin-mode-toggle"
    :class="{ 'admin-mode-toggle--active': adminMode.hasAnyAdminModeEnabled }"
  >
    <header class="admin-mode-toggle__header">
      <p class="admin-mode-toggle__title">Admin Mode</p>
      <UiBadge
        v-if="adminModeLabel"
        class="admin-mode-toggle__state"
        variant="info"
        size="sm"
        :aria-label="`Admin mode state: ${adminModeLabel}`"
      >
        {{ adminModeLabel }}
      </UiBadge>
    </header>

    <UiSwitch
      :model-value="adminMode.adminViewEnabled"
      @update:model-value="setAdminView"
    >
      Admin visibility
    </UiSwitch>
    <p class="admin-mode-toggle__copy">
      Reveals private and restricted content in read-only mode.
    </p>

    <template v-if="adminMode.canUseAdminEdit">
      <UiSwitch
        :model-value="adminMode.adminEditEnabled"
        :disabled="!adminMode.adminViewEnabled"
        @update:model-value="setAdminEdit"
      >
        Admin edit
      </UiSwitch>
      <p class="admin-mode-toggle__copy">
        Captain-only elevated editing. Requires admin visibility to stay enabled.
      </p>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { refreshNuxtData } from '#app';
import { UiBadge, UiSwitch } from '~/components/ui';
import { useAdminModeStore } from '~/stores/adminMode';
import { useSessionStore } from '~/stores/session';

const session = useSessionStore();
const adminMode = useAdminModeStore();
const hydrated = ref(false);

onMounted(() => {
  hydrated.value = true;
  if (!adminMode.initialised) {
    adminMode.initialise();
  }
  adminMode.syncWithSession();
});

const visible = computed(() => {
  if (!hydrated.value) return false;
  if (!session.initialised) return false;
  if (!session.isAuthenticated) return false;
  return adminMode.canUseAdminView;
});

const adminModeLabel = computed<string | null>(() => {
  if (adminMode.adminEditEnabled) return 'View + Edit';
  if (adminMode.adminViewEnabled) return 'View';
  return null;
});

const setAdminView = (value: boolean) => {
  adminMode.setAdminViewEnabled(value);
  if (typeof refreshNuxtData === 'function') {
    void refreshNuxtData();
  }
};

const setAdminEdit = (value: boolean) => {
  adminMode.setAdminEditEnabled(value);
  if (typeof refreshNuxtData === 'function') {
    void refreshNuxtData();
  }
};
</script>

<style scoped>
.admin-mode-toggle {
  --admin-mode-toggle-right-max: var(--space-xl);
  --admin-mode-toggle-right-fluid: 4%;
  --admin-mode-toggle-max-width: calc(var(--size-base-space-rem) * 20);
  --admin-mode-toggle-width: min(var(--admin-mode-toggle-max-width), calc(100% - (var(--space-xl) * 2)));
  --admin-mode-toggle-border-width: var(--size-base-layout-px);

  position: fixed;
  top: calc(50% + var(--space-2xl));
  right: min(var(--admin-mode-toggle-right-max), var(--admin-mode-toggle-right-fluid));
  transform: translateY(-50%);
  z-index: 1195;
  width: var(--admin-mode-toggle-width);
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--layout-card-radius);
  border: var(--admin-mode-toggle-border-width) solid var(--color-border-weak);
  background: color-mix(in srgb, var(--color-surface-dialog) 88%, transparent);
  backdrop-filter: blur(var(--content-panel-blur));
  -webkit-backdrop-filter: blur(var(--content-panel-blur));
  box-shadow: var(--shadow-overlay);
}

.admin-mode-toggle--active {
  border-color: var(--color-border-focus);
}

.admin-mode-toggle__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.admin-mode-toggle__title {
  margin: 0;
  font-size: var(--size-base-space-rem);
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.admin-mode-toggle__state {
  justify-self: end;
}

.admin-mode-toggle__copy {
  margin: 0 0 var(--space-xs);
  color: var(--color-text-secondary);
  font-size: var(--space-sm);
  line-height: 1.35;
}

@media (--bp-max-lg) {
  .admin-mode-toggle {
    top: auto;
    bottom: calc(var(--space-lg) + (var(--space-2xl) * 2));
    transform: none;
  }
}
</style>
