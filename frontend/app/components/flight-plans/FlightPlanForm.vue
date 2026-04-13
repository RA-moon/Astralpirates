<template>
  <form class="flight-plan-form u-section" @submit.prevent="handleSubmit">
    <div class="flight-plan-form__grid u-grid u-grid--section">
      <UiFormField label="Title" :required="true">
        <template #default="{ id, describedBy }">
          <UiTextInput
            v-model.trim="form.title"
            :id="id"
            :described-by="describedBy"
            required
            autocomplete="off"
          />
        </template>
      </UiFormField>
      <UiFormField label="Event date">
        <template #default="{ id }">
          <UiTextInput v-model="form.eventDate" :id="id" type="date" />
        </template>
      </UiFormField>
      <UiFormField label="Category" :required="true" description="Select the mission type.">
        <template #default="{ id }">
          <UiSelect
            v-model="form.category"
            :id="id"
            :options="categoryOptions"
          />
        </template>
      </UiFormField>
      <UiFormField label="Location">
        <template #default="{ id, describedBy }">
          <UiTextInput v-model.trim="form.location" :id="id" :described-by="describedBy" />
        </template>
      </UiFormField>
    </div>

    <UiFormField label="Summary" description="Optional short teaser.">
      <template #default="{ id, describedBy }">
        <UiTextArea
          v-model.trim="form.summary"
          :id="id"
          :described-by="describedBy"
          rows="3"
        />
      </template>
    </UiFormField>

    <UiFormField label="Body" :required="true" description="Describe the mission.">
      <template #default="{ id, describedBy }">
        <UiTextArea
          v-model="form.body"
          :id="id"
          :described-by="describedBy"
          rows="6"
          required
        />
      </template>
    </UiFormField>

    <FlightPlanGalleryEditor
      v-if="showGalleryEditor"
      v-model="form.gallerySlides"
      :disabled="!allowGalleryEditing"
      readonly-help="Only captains can edit the mission gallery."
      :flight-plan-id="flightPlanId"
      :flight-plan-slug="flightPlanSlug"
    />

    <UiInline class="flight-plan-form__actions u-inline u-inline--wrap" :gap="undefined">
      <UiButton
        v-if="showReset"
        type="button"
        variant="ghost"
        @click="handleReset"
        :disabled="submitting"
      >
        Reset
      </UiButton>
      <UiButton type="submit" :loading="submitting">
        {{ submitLabel }}
      </UiButton>
    </UiInline>
  </form>
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue';
import { UiButton, UiFormField, UiInline, UiSelect, UiTextArea, UiTextInput } from '~/components/ui';
import FlightPlanGalleryEditor from './FlightPlanGalleryEditor.vue';
import {
  createGallerySlideDraft,
  stripDraftMetadata,
  type FlightPlanFormValues,
  type FlightPlanGallerySlideDraft,
} from './types';

const props = withDefaults(
  defineProps<{
    initialValues?: Partial<FlightPlanFormValues> | null;
    submitting?: boolean;
    submitLabel?: string;
    showReset?: boolean;
    showGalleryEditor?: boolean;
    allowGalleryEditing?: boolean;
    flightPlanId?: number | null;
    flightPlanSlug?: string | null;
  }>(),
  {
    initialValues: null,
    submitting: false,
    submitLabel: 'Save mission',
    showReset: true,
    showGalleryEditor: true,
    allowGalleryEditing: true,
    flightPlanId: null,
    flightPlanSlug: null,
  },
);

const emit = defineEmits<{
  submit: [FlightPlanFormValues];
  reset: [];
}>();

type FlightPlanFormState = Omit<FlightPlanFormValues, 'gallerySlides'> & {
  gallerySlides: FlightPlanGallerySlideDraft[];
};

const defaults = (): FlightPlanFormState => ({
  title: '',
  summary: '',
  body: '',
  category: 'project',
  location: '',
  eventDate: '',
  gallerySlides: [],
});

const form = reactive<FlightPlanFormState>(defaults());

const categoryOptions = [
  { label: 'Project', value: 'project' },
  { label: 'Event', value: 'event' },
  { label: 'Test', value: 'test' },
];

const applyInitialValues = (values?: Partial<FlightPlanFormValues> | null) => {
  const base = defaults();
  const next = { ...base, ...(values ?? {}) };
  form.title = next.title ?? '';
  form.summary = next.summary ?? '';
  form.body = next.body ?? '';
  form.category = next.category ?? 'project';
  form.location = next.location ?? '';
  form.eventDate = next.eventDate ?? '';
  form.gallerySlides = Array.isArray(values?.gallerySlides)
    ? values!.gallerySlides.map((slide) => createGallerySlideDraft(slide))
    : [];
};

watch(
  () => props.initialValues,
  (next) => {
    applyInitialValues(next);
  },
  { immediate: true, deep: true },
);

const buildPayload = (): FlightPlanFormValues => ({
  title: form.title,
  summary: form.summary,
  body: form.body,
  category: form.category,
  location: form.location,
  eventDate: form.eventDate,
  gallerySlides: stripDraftMetadata(form.gallerySlides),
});

const handleSubmit = () => {
  emit('submit', buildPayload());
};

const handleReset = () => {
  applyInitialValues(props.initialValues);
  emit('reset');
};

defineExpose({
  reset: handleReset,
  getValues: () => buildPayload(),
});
</script>

<style scoped>
.flight-plan-form__grid {
  grid-template-columns: repeat(auto-fit, minmax(calc(var(--size-base-layout-px) * 220 * var(--size-scale-factor)), 1fr));
}

.flight-plan-form__actions {
  justify-content: flex-end;
}
</style>
