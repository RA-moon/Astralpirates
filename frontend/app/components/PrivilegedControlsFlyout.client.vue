<template>
  <aside
    v-if="visible"
    class="privileged-controls-flyout"
    :class="{ 'privileged-controls-flyout--active': adminMode.hasAnyAdminModeEnabled }"
  >
    <UiButton
      type="button"
      variant="secondary"
      class="privileged-controls-flyout__trigger"
      :aria-expanded="expanded"
      aria-controls="privileged-controls-flyout-panel"
      @click="toggleExpanded"
    >
      <span class="privileged-controls-flyout__trigger-label">Privileges</span>
      <UiBadge
        v-if="adminModeLabel"
        size="sm"
        variant="info"
        class="privileged-controls-flyout__state"
        :aria-label="`Admin mode state: ${adminModeLabel}`"
      >
        {{ adminModeLabel }}
      </UiBadge>
    </UiButton>

    <div
      v-if="expanded"
      id="privileged-controls-flyout-panel"
      class="privileged-controls-flyout__panel"
    >
      <UiSwitch
        v-if="showAdminViewControl"
        :model-value="adminMode.adminViewEnabled"
        @update:model-value="setAdminView"
      >
        Admin visibility
      </UiSwitch>
      <p v-if="showAdminViewControl" class="privileged-controls-flyout__copy">
        Reveals private and restricted content in read-only mode.
      </p>

      <template v-if="showAdminEditControl">
        <UiSwitch
          :model-value="adminMode.adminEditEnabled"
          :disabled="!adminMode.adminViewEnabled"
          @update:model-value="setAdminEdit"
        >
          Admin edit
        </UiSwitch>
        <p class="privileged-controls-flyout__copy">
          Captain-only elevated editing. Requires admin visibility.
        </p>
      </template>

      <p v-if="showCaptainPageEditHint" class="privileged-controls-flyout__copy">
        Enable admin edit to unlock static-page editing in god mode.
      </p>

      <UiButton
        v-if="showPageEditControl"
        type="button"
        variant="secondary"
        class="privileged-controls-flyout__page-edit"
        aria-label="Edit page"
        @click="openEditor"
      >
        Edit page
      </UiButton>

      <slot name="extra-actions" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { refreshNuxtData } from '#app';
import { UiBadge, UiButton, UiSwitch } from '~/components/ui';
import { useAdminModeStore } from '~/stores/adminMode';
import { useSessionStore } from '~/stores/session';
import { usePageEditingPermissions } from '~/composables/usePageEditingPermissions';
import { usePageEditorState } from '~/composables/usePageEditorState';
import type { PageDocument } from '~/modules/api/schemas';

const props = withDefaults(defineProps<{
  pageData: PageDocument | null;
  hasExtraControls?: boolean;
}>(), {
  hasExtraControls: false,
});

const session = useSessionStore();
const adminMode = useAdminModeStore();
const editor = usePageEditorState();
const permissions = usePageEditingPermissions(() => props.pageData ?? null);
const hydrated = ref(false);
const expanded = ref(false);

onMounted(() => {
  hydrated.value = true;
  if (!adminMode.initialised) {
    adminMode.initialise();
  }
  adminMode.syncWithSession();
});

const showAdminViewControl = computed(() => {
  if (!hydrated.value) return false;
  if (!session.initialised) return false;
  if (!session.isAuthenticated) return false;
  return adminMode.canUseAdminView;
});

const showAdminEditControl = computed(() => {
  if (!showAdminViewControl.value) return false;
  return adminMode.canUseAdminEdit;
});

const currentUserRole = computed(() => {
  const role = session.currentUser?.role;
  if (typeof role !== 'string') return null;
  const trimmed = role.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
});

const captainPageEditRequiresAdminEdit = computed(() => currentUserRole.value === 'captain');

const showPageEditControl = computed(() => {
  if (!hydrated.value) return false;
  if (!permissions.isReady.value) return false;
  if (!permissions.canEdit.value) return false;
  if (captainPageEditRequiresAdminEdit.value && !adminMode.adminEditEnabled) return false;
  return Boolean(props.pageData);
});

const showCaptainPageEditHint = computed(() => {
  if (!hydrated.value) return false;
  if (!permissions.isReady.value) return false;
  if (!permissions.canEdit.value) return false;
  if (!captainPageEditRequiresAdminEdit.value) return false;
  return !adminMode.adminEditEnabled && Boolean(props.pageData);
});

const visible = computed(() => {
  if (!hydrated.value) return false;
  if (!session.initialised) return false;
  return showAdminViewControl.value || showPageEditControl.value || props.hasExtraControls;
});

watch(
  visible,
  (next) => {
    if (!next) {
      expanded.value = false;
    }
  },
);

const adminModeLabel = computed<string | null>(() => {
  if (adminMode.adminEditEnabled) return 'View + Edit';
  if (adminMode.adminViewEnabled) return 'View';
  return null;
});

const toggleExpanded = () => {
  expanded.value = !expanded.value;
};

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

const openEditor = () => {
  if (!props.pageData) return;
  editor.openEditor(props.pageData);
  expanded.value = false;
};
</script>

<style scoped>
.privileged-controls-flyout {
  --privileged-controls-flyout-top: calc(var(--clip-top) + var(--space-sm));
  --privileged-controls-flyout-panel-max-width: calc(var(--size-base-space-rem) * 22);
  --privileged-controls-flyout-border-width: var(--size-base-layout-px);

  position: fixed;
  top: var(--privileged-controls-flyout-top);
  left: 50%;
  transform: translateX(-50%);
  z-index: 1195;
  width: min(
    var(--privileged-controls-flyout-panel-max-width),
    calc(100% - (var(--space-lg) * 2))
  );
  display: grid;
  gap: var(--space-xs);
}

.privileged-controls-flyout--active
  :deep(.privileged-controls-flyout__trigger.ui-button.ui-button--secondary) {
  border-color: var(--color-border-focus);
}

.privileged-controls-flyout__trigger {
  justify-content: center;
  width: 100%;
  backdrop-filter: blur(var(--content-panel-blur));
  -webkit-backdrop-filter: blur(var(--content-panel-blur));
}

.privileged-controls-flyout__trigger-label {
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  text-transform: uppercase;
}

.privileged-controls-flyout__state {
  justify-self: end;
}

.privileged-controls-flyout__panel {
  display: grid;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--layout-card-radius);
  border: var(--privileged-controls-flyout-border-width) solid var(--color-border-weak);
  background: color-mix(in srgb, var(--color-surface-dialog) 88%, transparent);
  backdrop-filter: blur(var(--content-panel-blur));
  -webkit-backdrop-filter: blur(var(--content-panel-blur));
  box-shadow: var(--shadow-overlay);
}

.privileged-controls-flyout__copy {
  margin: 0 0 var(--space-xs);
  color: var(--color-text-secondary);
  font-size: var(--space-sm);
  line-height: 1.35;
}

.privileged-controls-flyout__page-edit {
  justify-self: start;
}
</style>
