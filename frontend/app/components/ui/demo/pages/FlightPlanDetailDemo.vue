<template>
  <section class="container page page-flight-plan">
    <header class="page-header flight-plan__header">
      <span class="eyebrow">Flight plans</span>
      <h1 class="animated-title">{{ plan.title }}</h1>
      <p class="tagline">{{ metaLine }}</p>
    </header>

    <UiSurface as="article" variant="card" class="flight-plan__body">
      <p v-for="paragraph in plan.body" :key="paragraph" class="flight-plan__paragraph">
        {{ paragraph }}
      </p>
    </UiSurface>

    <UiSurface as="section" variant="card" class="flight-plan__collaboration">
      <div class="flight-plan__collaboration-headline">
        <h2>Crew roster</h2>
        <p>Invite additional passengers and coordinate crews for this mission.</p>
      </div>

      <form class="flight-plan__invite-form">
        <label class="flight-plan__invite-label">
          Crew profile slug
          <input type="text" value="vector" readonly />
        </label>
        <UiButton type="button" disabled>
          Send invite
        </UiButton>
      </form>

      <p class="flight-plan__collaboration-note">Scanning the chart for new orders…</p>

      <ul class="flight-plan__invite-suggestions">
        <li v-for="suggestion in suggestions" :key="suggestion.profileSlug">
          <button type="button" class="flight-plan__invite-suggestion-button" @click.prevent>
            <span class="flight-plan__invite-suggestion-name">
              {{ suggestion.callSign }}
            </span>
            <span class="flight-plan__invite-suggestion-slug">
              /gangway/crew-quarters/{{ suggestion.profileSlug }}
            </span>
            <span class="flight-plan__invite-suggestion-role">{{ suggestion.role }}</span>
          </button>
        </li>
      </ul>

      <div class="flight-plan__member-section">
        <p class="flight-plan__collaboration-note">Crew roster</p>
        <ul class="flight-plan__member-list">
          <li v-for="member in members" :key="member.id" class="flight-plan__member">
            <div class="flight-plan__member-primary">
              <NuxtLink :to="member.href">{{ member.name }}</NuxtLink>
            </div>
            <div class="flight-plan__member-secondary">
              <span class="flight-plan__member-status">{{ member.status }}</span>
              <span v-if="member.meta" class="flight-plan__member-meta">{{ member.meta }}</span>
              <UiButton v-if="member.canPromote" type="button" variant="secondary" disabled>
                Promote to crew
              </UiButton>
            </div>
          </li>
        </ul>
      </div>
    </UiSurface>

    <UiSurface as="section" variant="card" class="flight-plan__logs">
      <div class="flight-plan__logs-meta">
        <UiTag size="sm">Logbook</UiTag>
      </div>
      <LogSummaryCard v-for="log in logs" :key="log.id" :log="log" />
    </UiSurface>
  </section>
</template>

<script setup lang="ts">
import LogSummaryCard from '~/components/LogSummaryCard.vue';
import { sampleLogSummaries } from '~/components/ui/demo/sampleData';
import { UiButton, UiSurface, UiTag } from '~/components/ui';

const plan = {
  title: 'Midnight maintenance window',
  body: [
    'Hot-swap starboard relays and reroute backup power while the bridge sleeps.',
    'Crew should stage tools near the Arch hangar and confirm EVA suits are sealed before depressurisation.',
  ],
  location: 'Arch hangar',
  displayDate: 'Apr 26, 2025',
};

const metaLine = `${plan.displayDate} · ${plan.location}`;

const suggestions = [
  { profileSlug: 'vector', callSign: 'Vector', role: 'Navigator' },
  { profileSlug: 'sparrow', callSign: 'Sparrow', role: 'Science officer' },
];

const members = [
  {
    id: 1,
    name: 'Nova',
    href: '/gangway/crew-quarters/nova',
    status: 'Captain',
    meta: 'Joined Apr 22 · 22:00 UTC',
    canPromote: false,
  },
  {
    id: 2,
    name: 'Vector',
    href: '/gangway/crew-quarters/vector',
    status: 'Crew organiser',
    meta: 'Invited Apr 23',
    canPromote: false,
  },
  {
    id: 3,
    name: 'Sparrow',
    href: '/gangway/crew-quarters/sparrow',
    status: 'Passenger (pending acceptance)',
    meta: 'Invited Apr 24',
    canPromote: true,
  },
];

const logs = sampleLogSummaries;
</script>

<style scoped>
.flight-plan__state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
  text-align: center;
}

.flight-plan__header {
  margin-bottom: 2rem;
}

.flight-plan__body {
  padding: 2rem;
}

.flight-plan__paragraph {
  margin-bottom: 1rem;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.86);
}

.flight-plan__logs-meta {
  display: flex;
  justify-content: flex-end;
}

.flight-plan__logs {
  margin-top: 3rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.flight-plan__collaboration {
  margin-top: 2rem;
  padding: 1.75rem;
  display: grid;
  gap: 1rem;
}

.flight-plan__collaboration-headline h2 {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 1.1rem;
}

.flight-plan__collaboration-headline p {
  margin: 0.35rem 0 0;
  color: var(--color-text-muted);
}

.flight-plan__invite-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}

.flight-plan__invite-label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-muted);
  flex: 1 1 220px;
}

.flight-plan__invite-label input {
  padding: 0.65rem 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
}

.flight-plan__invite-label input:focus {
  outline: 2px solid rgba(159, 214, 245, 0.8);
  outline-offset: 2px;
}

.flight-plan__invite-suggestions {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.5rem;
}

.flight-plan__invite-suggestion-button {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(159, 214, 245, 0.25);
  background: rgba(9, 20, 34, 0.6);
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
  display: grid;
  gap: 0.2rem;
  color: inherit;
  cursor: pointer;
}

.flight-plan__invite-suggestion-button:hover,
.flight-plan__invite-suggestion-button:focus-visible {
  border-color: rgba(159, 214, 245, 0.55);
}

.flight-plan__invite-suggestion-role {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(159, 214, 245, 0.8);
}

.flight-plan__collaboration-feedback {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(159, 214, 245, 0.85);
}

.flight-plan__collaboration-note {
  margin: 0;
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.flight-plan__member-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.75rem;
}

.flight-plan__member {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  border: 1px solid rgba(159, 214, 245, 0.18);
  background: rgba(9, 20, 34, 0.55);
}

.flight-plan__member-primary a {
  color: rgba(159, 214, 245, 0.95);
  text-decoration: none;
}

.flight-plan__member-primary a:hover,
.flight-plan__member-primary a:focus-visible {
  text-decoration: underline;
}

.flight-plan__member-secondary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.flight-plan__member-status {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.75);
}

.flight-plan__member-meta {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
</style>
