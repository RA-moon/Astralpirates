<template>
  <section class="container page page-logbook">
    <header class="page-header">
      <h1 class="animated-title">Logbook (demo)</h1>
      <p class="tagline">
        Dispatches from the bridge, chronicling builds, voyages, and experiments in progress. This clone mirrors the
        current layout without fetching CMS data.
      </p>
      <div class="page-header__ctas">
        <UiLinkButton to="/bridge" variant="secondary">Return to the bridge</UiLinkButton>
        <UiLinkButton to="/bridge/flight-plans">Browse flight plans</UiLinkButton>
      </div>
    </header>

    <UiSurface as="section" variant="card" class="logbook-card logbook-filters">
      <UiStack :gap="'var(--space-xl)'">
        <section class="logbook-filters__group" aria-label="Filter by role">
          <UiText class="logbook-filters__label" variant="muted">Role</UiText>
          <UiInline class="logbook-filters__options" :gap="'var(--space-sm)'" :wrap="true">
            <UiCheckbox
              v-for="role in roleOptions"
              :key="role.value"
              :model-value="selectedRoles.includes(role.value)"
              :value="role.value"
              disabled
            >
              {{ role.label }}
            </UiCheckbox>
          </UiInline>
        </section>

        <section class="logbook-filters__group" aria-label="Filter by user">
          <UiText class="logbook-filters__label" variant="muted">User</UiText>
          <UiFormField label="Crew search" :hide-label="true">
            <template #default="{ id, describedBy }">
              <UiTextInput
                :id="id"
                :described-by="describedBy"
                type="search"
                placeholder="Search crew by call sign or slug"
                :model-value="searchQuery"
                readonly
              />
            </template>
            <template #description>
              Showing sample results…
            </template>
          </UiFormField>
          <ul class="logbook-filters__suggestions">
            <li v-for="member in searchResults" :key="member.profileSlug">
              <UiButton
                type="button"
                variant="ghost"
                class="logbook-filters__suggestion"
                block
                disabled
              >
                <span class="logbook-filters__suggestion-name">{{ formatCrewLabel(member) }}</span>
                <span v-if="member.role" class="logbook-filters__suggestion-meta">
                  {{ formatRoleLabel(member.role) }}
                </span>
              </UiButton>
            </li>
          </ul>
          <UiInline class="logbook-filters__chips" :gap="'var(--space-xs)'" :wrap="true">
            <UiTag v-for="member in selectedUsers" :key="member.profileSlug">
              {{ formatCrewLabel(member) }}
            </UiTag>
          </UiInline>
        </section>

        <footer class="logbook-filters__actions">
          <UiButton type="button" variant="secondary" disabled>
            Show all logs
          </UiButton>
        </footer>
      </UiStack>
    </UiSurface>

    <UiSurface as="section" variant="card" class="logbook-card">
      <div class="logbook-card__meta">
        <UiTag size="sm">Logbook</UiTag>
      </div>
      <div class="logbook-demo__list">
        <LogSummaryCard v-for="log in sampleLogs" :key="log.id" :log="log" />
      </div>
    </UiSurface>
  </section>
</template>

<script setup lang="ts">
import type { CrewSearchResult } from '~/components/ui/demo/types';
import { sampleLogSummaries } from '~/components/ui/demo/sampleData';
import LogSummaryCard from '~/components/LogSummaryCard.vue';
import { CREW_ROLE_LABELS, CREW_ROLES } from '@astralpirates/shared/crewRoles';
import {
  UiButton,
  UiCheckbox,
  UiFormField,
  UiInline,
  UiLinkButton,
  UiStack,
  UiSurface,
  UiTag,
  UiText,
  UiTextInput,
} from '~/components/ui';

type CrewResult = CrewSearchResult;

const roleOptions = CREW_ROLES.map((role) => ({
  value: role,
  label: CREW_ROLE_LABELS[role] ?? role,
}));

const selectedRoles = ['captain', 'navigator'];

const searchResults: CrewResult[] = [
  { profileSlug: 'nova', displayName: 'Nova', callSign: 'Nova', role: 'captain' },
  { profileSlug: 'vector', displayName: 'Vector', callSign: 'Vector', role: 'navigator' },
];

const selectedUsers: CrewResult[] = [
  { profileSlug: 'nova', displayName: 'Nova', callSign: 'Nova', role: 'captain' },
];

const searchQuery = 'nov';

const formatCrewLabel = (member: CrewResult) => {
  return member.displayName?.trim() || member.callSign?.trim() || member.profileSlug;
};

const formatRoleLabel = (role: string | null | undefined) => {
  if (!role) return '';
  const normalized = role.toLowerCase();
  return CREW_ROLE_LABELS[normalized as keyof typeof CREW_ROLE_LABELS] ?? role;
};

const sampleLogs = sampleLogSummaries;
</script>

<style scoped>
.logbook-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.logbook-card__meta {
  display: flex;
  justify-content: flex-end;
}

.logbook-demo__list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
</style>

<style scoped>
.logbook-filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
}

.logbook-filters__group {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.logbook-filters__label {
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.logbook-filters__options {
  align-items: flex-start;
}

.logbook-filters__suggestions {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.logbook-filters__suggestion {
  justify-content: space-between;
}

.logbook-filters__suggestion-name {
  font-weight: 600;
}

.logbook-filters__suggestion-meta {
  font-size: 0.85rem;
  color: var(--color-text-muted);
}

.logbook-filters__chips {
  margin-top: -0.2rem;
}

.logbook-filters__actions {
  display: flex;
  justify-content: flex-end;
}
</style>
