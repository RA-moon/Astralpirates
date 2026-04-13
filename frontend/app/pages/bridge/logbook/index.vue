<template>
  <section class="container page page-logbook">
    <header class="page-header">
      <UiHeading :level="1">Logbook</UiHeading>
      <UiText class="tagline">
        Dispatches from the bridge, chronicling builds, voyages, and experiments in progress.
      </UiText>
      <UiInline class="page-header__ctas" :gap="'var(--space-sm)'">
        <UiLinkButton variant="secondary" to="/bridge">Return to the bridge</UiLinkButton>
        <UiLinkButton to="/bridge/flight-plans">Browse flight plans</UiLinkButton>
      </UiInline>
    </header>

    <UiSurface class="logbook-filters" variant="panel">
      <div class="logbook-filters__group">
        <UiText variant="eyebrow" class="logbook-filters__label">Roles</UiText>
        <UiMultiSelect
          v-model="appliedRoles"
          :options="roleOptions"
          placeholder="All roles"
        />
      </div>

      <div class="logbook-filters__group">
        <UiCrewSearchInput
          ref="crewSearchInput"
          label="User"
          placeholder="Search crew by call sign or slug"
          :min-chars="3"
          :limit="10"
          @select="selectCrewResult"
        />
        <UiInline v-if="selectedUsers.length" class="logbook-filters__chips" :gap="'var(--space-xs)'">
          <UiTag
            v-for="member in selectedUsers"
            :key="member.profileSlug"
            closable
            :close-label="`Remove ${formatCrewLabel(member)} from filters`"
            @close="removeCrewFilter(member.profileSlug)"
          >
            {{ formatCrewLabel(member) }}
          </UiTag>
        </UiInline>
      </div>

      <div class="logbook-filters__actions">
        <UiButton
          v-if="hasActiveFilters"
          type="button"
          variant="ghost"
          @click="clearFilters"
        >
          Show all logs
        </UiButton>
      </div>
    </UiSurface>

    <UiSurface variant="panel">
      <UiText variant="eyebrow">Logbook</UiText>
      <LogList
        title="Latest entries"
        :limit="10"
        min-role="captain"
        :roles="appliedRoles"
        :owners="ownerFilters"
        :show-composer="true"
        :allow-create="mayCreateLogs"
      />
    </UiSurface>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { CREW_ROLE_LABELS, CREW_ROLES } from '@astralpirates/shared/crewRoles';
import LogList from '~/components/LogList.vue';
import { useSessionStore } from '~/stores/session';
import {
  UiButton,
  UiCrewSearchInput,
  UiHeading,
  UiInline,
  UiLinkButton,
  UiMultiSelect,
  UiSurface,
  UiTag,
  UiText,
} from '~/components/ui';
import type { CrewSearchResult } from '~/types/crew';

const session = useSessionStore();
const mayCreateLogs = computed(() => session.isAuthenticated);

const roleOptions = CREW_ROLES.map((role) => ({
  value: role,
  label: CREW_ROLE_LABELS[role] ?? role,
}));

const appliedRoles = ref<string[]>([]);
const selectedUsers = ref<CrewSearchResult[]>([]);
const crewSearchInput = ref<InstanceType<typeof UiCrewSearchInput> | null>(null);

const ownerFilters = computed(() => selectedUsers.value.map((user) => user.profileSlug));
const hasActiveFilters = computed(
  () => appliedRoles.value.length > 0 || selectedUsers.value.length > 0,
);

const formatCrewLabel = (member: CrewSearchResult) =>
  member.displayName?.trim() || member.callSign?.trim() || member.profileSlug;

const clearFilters = () => {
  appliedRoles.value = [];
  selectedUsers.value = [];
  crewSearchInput.value?.clear();
};

const selectCrewResult = (member: CrewSearchResult) => {
  if (!member.profileSlug) return;
  if (selectedUsers.value.some((entry) => entry.profileSlug === member.profileSlug)) return;
  selectedUsers.value = [...selectedUsers.value, member];
  crewSearchInput.value?.clear();
};

const removeCrewFilter = (slug: string) => {
  selectedUsers.value = selectedUsers.value.filter((entry) => entry.profileSlug !== slug);
};
</script>

<style scoped>
.logbook-filters {
  display: grid;
  gap: var(--space-lg);
}

.logbook-filters__group {
  display: grid;
  gap: var(--space-sm);
}

.logbook-filters__label {
  font-size: calc(var(--size-base-space-rem) * 0.85);
}

.logbook-filters__chips {
  margin-top: var(--space-sm);
  display: flex;
  flex-wrap: wrap;
}

.logbook-filters__actions {
  margin-top: var(--space-xs);
}

@media (--bp-max-sm) {
  .logbook-filters__checkbox {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
