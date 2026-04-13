<template>
  <div class="crew-search">
    <label class="crew-search__label">{{ label }}</label>
    <div class="crew-search__control">
      <input
        v-model="queryRef"
        type="search"
        :placeholder="placeholder"
        class="crew-search__input"
        :aria-label="`${label} search`"
      />
      <p v-if="pending" class="crew-search__status">Searching…</p>
      <p v-else-if="error" class="crew-search__status crew-search__status--error">{{ error }}</p>
      <p v-else class="crew-search__status crew-search__status--hint">
        {{ queryRef.trim().length < minChars ? `Type ${minChars} characters to search` : '&nbsp;' }}
      </p>
    </div>
    <ul v-if="results.length" class="crew-search__suggestions">
      <li v-for="member in results" :key="member.profileSlug">
        <button type="button" class="crew-search__suggestion" @click="handleSelect(member)">
          <span class="crew-search__name">{{ formatCrewLabel(member) }}</span>
          <span v-if="member.role" class="crew-search__meta">{{ formatRoleLabel(member.role) }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CREW_ROLE_LABELS } from '@astralpirates/shared/crewRoles';
import { useCrewSearch } from '~/composables/useCrewSearch';
import type { CrewSearchResult } from '~/types/crew';

const props = withDefaults(
  defineProps<{
    label?: string;
    placeholder?: string;
    minChars?: number;
    limit?: number;
  }>(),
  {
    label: 'User',
    placeholder: 'Search crew by call sign or slug',
    minChars: 3,
    limit: 10,
  },
);

const emit = defineEmits<{
  (event: 'select', member: CrewSearchResult): void;
}>();

const { query, results, pending, error, clear } = useCrewSearch({
  minQueryLength: props.minChars,
  limit: props.limit,
});

const queryRef = computed({
  get: () => query.value,
  set: (value: string) => {
    query.value = value;
  },
});

const formatCrewLabel = (member: CrewSearchResult) =>
  member.displayName?.trim() || member.callSign?.trim() || member.profileSlug;

const formatRoleLabel = (role: string | null | undefined) => {
  if (!role) return '';
  const normalized = role.toLowerCase();
  return CREW_ROLE_LABELS[normalized as keyof typeof CREW_ROLE_LABELS] ?? role;
};

const handleSelect = (member: CrewSearchResult) => {
  emit('select', member);
  clear();
};

const minChars = props.minChars;

defineExpose({ clear });
</script>

<style scoped>
.crew-search {
  --crew-search-gap: var(--space-xs);
  --crew-search-control-gap: var(--crew-identity-gap);
  --crew-search-label-size: calc(var(--size-base-space-rem) * 0.8);
  --crew-search-input-padding-block: calc(var(--size-base-space-rem) * 0.6);
  --crew-search-input-padding-inline: var(--space-sm);
  --crew-search-border-width: var(--size-base-layout-px);
  --crew-search-input-radius: var(--radius-control);
  --crew-search-focus-outline-width: calc(var(--size-base-layout-px) * 2);
  --crew-search-focus-outline-offset: calc(var(--size-base-layout-px) * 2);
  --crew-search-suggestions-radius: calc(var(--radius-sm) + (var(--size-base-layout-px) * 2));
  --crew-search-suggestion-padding-block: calc(var(--size-base-space-rem) * 0.65);
  --crew-search-suggestion-padding-inline: calc(var(--size-base-space-rem) * 0.85);
  --crew-search-name-size: calc(var(--size-base-space-rem) * 0.95);
  --crew-search-meta-size: var(--space-sm);

  display: grid;
  gap: var(--crew-search-gap);
}

.crew-search__label {
  font-size: var(--crew-search-label-size);
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.crew-search__control {
  display: flex;
  flex-direction: column;
  gap: var(--crew-search-control-gap);
}

.crew-search__input {
  width: 100%;
  padding: var(--crew-search-input-padding-block) var(--crew-search-input-padding-inline);
  border-radius: var(--crew-search-input-radius);
  border: var(--crew-search-border-width) solid var(--color-field-border);
  background: var(--color-field-background);
  color: inherit;
}

.crew-search__input:focus {
  outline: var(--crew-search-focus-outline-width) solid var(--color-border-focus);
  outline-offset: var(--crew-search-focus-outline-offset);
}

.crew-search__status {
  margin: 0;
  font-size: var(--crew-search-label-size);
  color: var(--color-text-muted);
}

.crew-search__status--error {
  color: var(--color-danger);
}

.crew-search__status--hint {
  opacity: 0.7;
}

.crew-search__suggestions {
  list-style: none;
  margin: 0;
  padding: 0;
  border: var(--crew-search-border-width) solid var(--color-border-weak);
  border-radius: var(--crew-search-suggestions-radius);
  overflow: hidden;
}

.crew-search__suggestion {
  width: 100%;
  border: none;
  background: transparent;
  padding: var(--crew-search-suggestion-padding-block) var(--crew-search-suggestion-padding-inline);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--crew-search-gap);
  color: inherit;
  cursor: pointer;
}

.crew-search__suggestion:hover,
.crew-search__suggestion:focus-visible {
  background: var(--color-surface-base);
}

.crew-search__name {
  font-size: var(--crew-search-name-size);
}

.crew-search__meta {
  font-size: var(--crew-search-meta-size);
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  text-transform: uppercase;
  color: var(--color-text-muted);
}
</style>
