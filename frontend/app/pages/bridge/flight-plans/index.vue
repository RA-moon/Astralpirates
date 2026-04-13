<template>
  <section class="container page page-flight-plans">
    <header class="page-header">
      <UiHeading :level="1">Flight plans</UiHeading>
      <UiText class="tagline">Upcoming missions, stopovers, and collaborations plotted by the crew.</UiText>
      <UiInline class="page-header__ctas" :gap="'var(--space-sm)'">
        <UiLinkButton variant="secondary" to="/bridge">Return to the bridge</UiLinkButton>
        <UiLinkButton to="/bridge/logbook">Visit the logbook</UiLinkButton>
      </UiInline>
    </header>

    <UiSurface variant="panel">
      <UiText variant="eyebrow">Bridge</UiText>
      <FlightPlanList
        ref="listRef"
        title="Mission roster"
        :limit="12"
        empty-label="No missions scheduled yet."
      />
    </UiSurface>

    <UiSurface v-if="mayCreate" variant="panel">
      <UiText variant="eyebrow">Crew tools</UiText>
      <UiHeading :level="2">Publish a flight plan</UiHeading>
      <FlightPlanForm
        ref="formRef"
        :initial-values="initialFormValues"
        :submitting="submitting"
        submit-label="Publish flight plan"
        @submit="submitPlan"
        @reset="handleFormReset"
      />
      <UiAlert
        v-if="feedback"
        :variant="feedbackIsError ? 'danger' : 'success'"
        layout="inline"
      >
        {{ feedback }}
      </UiAlert>
    </UiSurface>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import FlightPlanList from '~/components/FlightPlanList.vue';
import FlightPlanForm from '~/components/flight-plans/FlightPlanForm.vue';
import type { FlightPlanFormValues } from '~/components/flight-plans/types';
import { usePrivateProfile } from '~/domains/profiles';
import { createFlightPlan } from '~/domains/flightPlans';
import { can } from '@astralpirates/shared/authorization';
import { editorStringToRichText } from '~/utils/richText';
import { useSessionStore } from '~/stores/session';
import { UiAlert, UiHeading, UiInline, UiLinkButton, UiSurface, UiText } from '~/components/ui';

const { data } = usePrivateProfile();
const session = useSessionStore();

const mayCreate = computed(() => {
  const role = data.value?.role ?? session.currentUser?.role ?? null;
  const userId = data.value?.id ?? session.currentUser?.id ?? null;
  return can('createFlightPlans', {
    actor: {
      userId,
      isAuthenticated: session.isAuthenticated && userId != null,
      websiteRole: role,
    },
  });
});

const submitting = ref(false);
const feedback = ref('');
const feedbackIsError = ref(false);
const listRef = ref<InstanceType<typeof FlightPlanList> | null>(null);
const formRef = ref<InstanceType<typeof FlightPlanForm> | null>(null);
const initialFormValues = ref<FlightPlanFormValues>({
  title: '',
  summary: '',
  body: '',
  category: 'project',
  location: '',
  eventDate: '',
  gallerySlides: [],
});

const handleFormReset = () => {
  feedback.value = '';
  feedbackIsError.value = false;
};

const submitPlan = async (values: FlightPlanFormValues) => {
  const title = values.title.trim();
  const bodyContent = editorStringToRichText(values.body);

  if (!title || bodyContent.length === 0) {
    feedback.value = 'Title and body are required.';
    feedbackIsError.value = true;
    return;
  }
  submitting.value = true;
  feedback.value = '';
  feedbackIsError.value = false;
  try {
    await createFlightPlan({
      auth: session.bearerToken,
      payload: {
        title,
        body: bodyContent,
        summary: values.summary.trim() || null,
        category: values.category,
        location: values.location.trim() || null,
        eventDate: values.eventDate || null,
        gallerySlides: values.gallerySlides,
      },
    });
    feedback.value = 'Flight plan published.';
    feedbackIsError.value = false;
    formRef.value?.reset();
    listRef.value?.refresh();
  } catch (err: any) {
    feedback.value = err?.statusMessage || err?.data?.error || err?.message || 'Failed to publish flight plan.';
    feedbackIsError.value = true;
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
</style>
