<template>
  <div v-if="mode === 'preview'" class="crew-quarter-preview" data-crew-preview>
    <p v-if="isLoading" class="loading-copy">Compiling crew manifest…</p>
    <p v-else-if="onDeckNames.length === 0" class="loading-copy">Crew manifest offline.</p>
    <p v-else class="loading-copy">
      Latest on deck:
      {{ onDeckNames.join(', ') }}
    </p>
  </div>

  <div v-else class="crew-on-deck" data-crew-on-deck :hidden="onDeckMembers.length === 0">
    <div class="crew-on-deck__header">
      <h3 class="crew-on-deck__title">On deck</h3>
      <span class="crew-on-deck__subtitle">Currently active pirates</span>
    </div>
    <p v-if="onDeckMembers.length === 0 && !isLoading" class="crew-on-deck__empty" data-crew-on-deck-empty>
      Crew manifest offline.
    </p>
    <div class="crew-on-deck__rail" tabindex="0" data-crew-on-deck-rail>
      <CrewIdentityCard
        v-for="member in onDeckMembers"
        :key="member.profileSlug"
        :call-sign="member.callSign"
        :display-name="member.displayName"
        :role-label="roleLabel(member.role)"
        :avatar-url="member.avatarUrl"
        :avatar-media-type="member.avatarMediaType ?? null"
        :avatar-media-url="member.avatarMediaUrl ?? null"
        :avatar-mime-type="member.avatarMimeType ?? null"
        :avatar-filename="member.avatarFilename ?? null"
        :status="member.isOnline ? 'online' : 'offline'"
        :meta-label="routeMeta(member)"
        :profile-slug="member.profileSlug"
        size="md"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useCrewStore, type CrewMember } from '~/stores/crew';
import { CREW_ROLE_LABELS } from '@astralpirates/shared/crewRoles';
import CrewIdentityCard from '~/components/CrewIdentityCard.vue';
import { formatCrewRoute } from '~/utils/formatCrewRoute';
import { reportClientEvent } from '~/utils/errorReporter';

const props = withDefaults(
  defineProps<{
    mode?: 'preview' | 'full';
    limit?: number;
  }>(),
  {
    mode: 'full',
    limit: 6,
  },
);

const crew = useCrewStore();
const { members, status } = storeToRefs(crew);

const isLoading = computed(() => status.value === 'loading' && members.value.length === 0);

const sortedMembers = computed(() => {
  return [...members.value].sort((a, b) => {
    const aStamp = a.lastActiveAt ? Date.parse(a.lastActiveAt) : 0;
    const bStamp = b.lastActiveAt ? Date.parse(b.lastActiveAt) : 0;
    return bStamp - aStamp;
  });
});

const onDeckMembers = computed(() => sortedMembers.value.slice(0, props.limit));

const onDeckNames = computed(() =>
  onDeckMembers.value.map((member) => member.callSign || member.displayName || 'Crew'),
);

const roleLabel = (role?: string | null) => {
  if (!role) return 'Crew';
  return Object.prototype.hasOwnProperty.call(CREW_ROLE_LABELS, role)
    ? CREW_ROLE_LABELS[role as keyof typeof CREW_ROLE_LABELS]
    : 'Crew';
};

const routeMeta = (member: CrewMember) => {
  if (!member?.isOnline) return null;
  return formatCrewRoute(member.currentRoute);
};

onMounted(() => {
  if (!members.value.length) {
    crew.fetchMembers().catch((error) => {
      reportClientEvent({
        component: 'CrewRoster',
        message: 'Crew manifest fetch failed',
        error,
        level: 'warn',
      });
    });
  }
});
</script>

<style scoped>
.crew-on-deck {
  --crew-on-deck-title-font-size: calc(var(--crew-identity-meta-font-size) * 1.3571);
  --crew-on-deck-title-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 1.25);
  --crew-on-deck-subtitle-font-size: calc(var(--crew-identity-meta-font-size) * 1.2143);
  --crew-on-deck-rail-gap: calc(var(--size-avatar-lg) * 0.1953);
  --crew-on-deck-scrollbar-height: calc(var(--size-base-layout-px) * 6 * var(--size-scale-factor));
  --crew-on-deck-focus-outline-width: calc(var(--size-base-layout-px) * 2 * var(--size-scale-factor));
  --crew-on-deck-focus-outline-offset: calc(var(--size-base-layout-px) * 4 * var(--size-scale-factor));
  --crew-on-deck-rail-gap-mobile: calc(var(--size-avatar-lg) * 0.1581);
  --crew-on-deck-title-font-size-mobile: calc(var(--crew-identity-meta-font-size) * 1.2857);
  --crew-on-deck-subtitle-font-size-mobile: calc(var(--crew-identity-meta-font-size) * 1.0714);
}

.crew-on-deck__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-xs);
  flex-wrap: wrap;
}

.crew-on-deck__title {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: var(--crew-on-deck-title-letter-spacing);
  font-size: var(--crew-on-deck-title-font-size);
  color: var(--color-text-secondary);
}

.crew-on-deck__subtitle {
  font-size: var(--crew-on-deck-subtitle-font-size);
  text-transform: uppercase;
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  color: var(--color-text-meta);
}

.crew-on-deck__rail {
  display: flex;
  gap: var(--crew-on-deck-rail-gap);
  overflow-x: auto;
  padding: var(--space-2xs) var(--space-xs) var(--space-sm) 0;
  scroll-snap-type: x proximity;
}

.crew-on-deck__rail::-webkit-scrollbar {
  height: var(--crew-on-deck-scrollbar-height);
}

.crew-on-deck__rail::-webkit-scrollbar-thumb {
  background: var(--color-border-weak);
  border-radius: var(--radius-pill);
}

.crew-on-deck__rail:focus-visible {
  outline: var(--crew-on-deck-focus-outline-width) solid var(--color-border-contrast);
  outline-offset: var(--crew-on-deck-focus-outline-offset);
}

.crew-on-deck__rail :deep(.crew-identity) {
  --crew-identity-scroll-snap: start;
  --crew-identity-min-width-size: fit-content;
}

.crew-on-deck__empty {
  margin: 0;
  font-size: var(--crew-on-deck-subtitle-font-size);
  color: var(--color-text-caption);
}

@media (--bp-max-compact) {
  .crew-on-deck__rail {
    gap: var(--crew-on-deck-rail-gap-mobile);
    padding-right: 0;
  }

  .crew-on-deck__title {
    font-size: var(--crew-on-deck-title-font-size-mobile);
  }

  .crew-on-deck__subtitle {
    font-size: var(--crew-on-deck-subtitle-font-size-mobile);
  }
}
</style>
