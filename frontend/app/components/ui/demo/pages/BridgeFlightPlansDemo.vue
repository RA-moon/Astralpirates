<template>
  <section class="container page page-flight-plans">
    <header class="page-header">
      <h1 class="animated-title">Flight plans (demo)</h1>
      <p class="tagline">Upcoming missions, stopovers, and collaborations plotted by the crew.</p>
      <div class="page-header__ctas">
        <UiLinkButton to="/bridge" variant="secondary">Return to the bridge</UiLinkButton>
        <UiLinkButton to="/bridge/logbook">Visit the logbook</UiLinkButton>
      </div>
    </header>

    <UiSurface as="section" variant="card" class="flight-plan-demo__card">
      <div class="flight-plan-demo__meta">
        <UiTag size="sm">Bridge</UiTag>
      </div>
      <div class="flight-plan-demo__list">
        <FlightPlanSummaryCard
          v-for="plan in plans"
          :key="plan.id"
          :plan="plan"
        />
      </div>
    </UiSurface>

    <UiSurface as="section" variant="card" class="flight-plan-demo__card">
      <div class="flight-plan-demo__meta">
        <UiTag size="sm">Crew tools</UiTag>
      </div>
      <h2 class="animated-title">Publish a flight plan</h2>
      <form class="flight-plan-demo__form" aria-label="Publish a flight plan (demo)" @submit.prevent>
        <div class="flight-plan-demo__grid">
          <UiFormField label="Title">
            <template #default="{ id, describedBy }">
              <UiTextInput :id="id" :described-by="describedBy" :model-value="demoFlightPlan.title" readonly />
            </template>
          </UiFormField>
          <UiFormField label="Event date">
            <template #default="{ id, describedBy }">
              <UiTextInput
                :id="id"
                :described-by="describedBy"
                type="date"
                :model-value="demoFlightPlan.date"
                readonly
              />
            </template>
          </UiFormField>
          <UiFormField label="Location">
            <template #default="{ id, describedBy }">
              <UiTextInput :id="id" :described-by="describedBy" :model-value="demoFlightPlan.location" readonly />
            </template>
          </UiFormField>
        </div>
        <UiFormField label="Summary">
          <template #default="{ id, describedBy }">
            <UiTextArea
              :id="id"
              :described-by="describedBy"
              rows="3"
              :model-value="demoFlightPlan.summary"
              readonly
            />
          </template>
        </UiFormField>
        <UiFormField label="Body">
          <template #default="{ id, describedBy }">
            <UiTextArea
              :id="id"
              :described-by="describedBy"
              rows="6"
              :model-value="demoFlightPlan.body"
              readonly
            />
          </template>
        </UiFormField>
        <UiInline class="flight-plan-demo__actions" :gap="'var(--space-sm)'">
          <UiButton type="button" variant="secondary" disabled>
            Reset
          </UiButton>
          <UiButton type="submit" disabled>
            Publish flight plan
          </UiButton>
        </UiInline>
      </form>
      <UiAlert class="flight-plan-demo__note" variant="info" layout="inline">
        Crew role required: captain or higher.
      </UiAlert>
    </UiSurface>
  </section>
</template>

<script setup lang="ts">
import FlightPlanSummaryCard from '~/components/FlightPlanSummaryCard.vue';
import {
  UiAlert,
  UiButton,
  UiFormField,
  UiInline,
  UiLinkButton,
  UiSurface,
  UiTag,
  UiTextArea,
  UiTextInput,
} from '~/components/ui';
import { sampleFlightPlanSummaries } from '~/components/ui/demo/sampleData';

const plans = sampleFlightPlanSummaries;
const demoFlightPlan = {
  title: 'Midnight maintenance window',
  date: '2025-04-26',
  location: 'Arch hangar',
  summary: 'Hot-swap starboard relays and reroute backup power.',
  body: 'Spin up the midnight maintenance window for the Arch.',
};
</script>

<style scoped>
.flight-plan-demo__card {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.flight-plan-demo__meta {
  display: flex;
  justify-content: flex-end;
}

.flight-plan-demo__list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.flight-plan-demo__form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.flight-plan-demo__grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.flight-plan-demo__actions {
  justify-content: flex-end;
}

.flight-plan-demo__note {
  margin-top: var(--space-sm);
}
</style>
