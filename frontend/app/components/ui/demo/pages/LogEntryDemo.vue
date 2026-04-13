<template>
  <section class="container page log-entry-page">
    <UiSurface as="article" variant="card" class="log-entry">
      <header class="log-entry__header">
        <span class="log-entry__eyebrow">Captain's log</span>
        <h1 class="animated-title log-entry__title">
          <span class="log-entry__code">LOG SD-2404</span>
          <span class="log-entry__separator" aria-hidden="true"> – </span>
          <em class="log-entry__headline">Docking rehearsal complete</em>
        </h1>
        <p class="log-entry__meta">Apr 24, 2025 - 22:00 UTC</p>
        <div class="log-entry__identity">
          <CrewIdentityCard
            :call-sign="owner.callSign"
            :display-name="owner.displayName"
            :profile-slug="owner.profileSlug"
            :role-label="owner.roleLabel"
            :avatar-url="owner.avatarUrl"
            size="sm"
            status="offline"
            :meta-label="owner.roleLabel"
          />
        </div>
        <p class="log-entry__mission">Flight plan: Midnight maintenance window • Arch hangar</p>
      </header>

      <div class="log-entry__body">
        <p v-for="paragraph in body" :key="paragraph">{{ paragraph }}</p>
      </div>

      <nav class="log-entry__nav" aria-label="Log navigation">
        <UiLinkButton
          class="log-entry__nav-link log-entry__nav-link--prev"
          to="#"
          variant="secondary"
          aria-label="View previous log"
        >
          Previous
        </UiLinkButton>
        <UiLinkButton class="log-entry__nav-link log-entry__nav-link--all" to="/bridge/logbook" variant="secondary">
          All logs
        </UiLinkButton>
        <UiLinkButton
          class="log-entry__nav-link log-entry__nav-link--next"
          to="#"
          variant="secondary"
          aria-label="View next log"
        >
          Next
        </UiLinkButton>
      </nav>
    </UiSurface>
  </section>
</template>

<script setup lang="ts">
import CrewIdentityCard from '~/components/CrewIdentityCard.vue';
import { UiLinkButton, UiSurface } from '~/components/ui';

const owner = {
  callSign: 'Nova',
  displayName: 'Nova',
  profileSlug: 'nova',
  roleLabel: 'Captain',
  avatarUrl: 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=facearea&w=200&h=200&q=80',
};

const body = [
  'Docking rehearsals wrapped ahead of schedule. The new approach vectors shaved nearly eight minutes off the standard cycle.',
  'Next step: chart a maintenance window to hot-swap starboard relays before the next scouting run.',
];
</script>

<style scoped>
.log-entry-page {
  min-height: 60vh;
}

.log-entry-page__state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  text-align: center;
}

.log-entry-page__state--error {
  color: rgba(255, 255, 255, 0.75);
}

.log-entry__header {
  display: grid;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.log-entry__eyebrow {
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.65);
}

.log-entry__title {
  margin: 0;
  font-size: clamp(1.4rem, 3vw, 2rem);
}

.log-entry__code {
  font-weight: 600;
}

.log-entry__separator {
  margin: 0 0.35rem;
}

.log-entry__headline {
  font-style: italic;
}

.log-entry__meta,
.log-entry__mission {
  margin: 0;
  color: rgba(255, 255, 255, 0.75);
}

.log-entry__identity {
  margin-top: 0.5rem;
}

.log-entry__body {
  display: grid;
  gap: 1rem;
  line-height: 1.7;
  margin-bottom: 1.5rem;
}

.log-entry__nav {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
  align-items: center;
}

.log-entry__nav-link {
  justify-content: center;
}

.log-entry__nav-spacer {
  height: 2.5rem;
}

@media (--bp-max-sm) {
  .log-entry__nav-link {
    width: 100%;
  }
}
</style>
