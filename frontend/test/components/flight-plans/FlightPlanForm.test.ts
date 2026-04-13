import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import FlightPlanForm from '~/components/flight-plans/FlightPlanForm.vue';
import type { FlightPlanFormValues } from '~/components/flight-plans/types';
import { updateFlightPlan } from '~/domains/flightPlans';

vi.mock('~/domains/flightPlans', () => ({
  updateFlightPlan: vi.fn().mockResolvedValue({ plan: { slug: 'voyage' } }),
}));

vi.mock('~/stores/session', () => ({
  useSessionStore: () => ({
    bearerToken: null,
  }),
}));

describe('FlightPlanForm', () => {
  it('hydrates inputs from initial values and emits submit payload', async () => {
    const initialValues: FlightPlanFormValues = {
      title: 'Refit Expedition',
      summary: 'Dry dock repairs',
      body: 'Inspect hull\n\nConfirm supplies',
      category: 'event',
      location: 'Lunar Yard',
      eventDate: '2025-02-14',
      gallerySlides: [
        {
          label: 'Dry dock',
          title: 'Dry dock exterior',
          description: '',
          mediaType: 'image',
          imageType: 'url',
          imageUrl: 'https://example.com/dock.jpg',
          imageAlt: 'Dry dock exterior',
          creditLabel: '',
          creditUrl: '',
          galleryImage: null,
        },
      ],
    };

    const wrapper = mount(FlightPlanForm, {
      props: {
        initialValues,
        submitLabel: 'Save',
      },
    });

    await wrapper.find('form').trigger('submit.prevent');
    const submissions = wrapper.emitted('submit') ?? [];
    expect(submissions).toHaveLength(1);
    expect(submissions[0][0]).toMatchObject(initialValues);
  });

  it('can drive the update client once per submission', async () => {
    const Harness = {
      components: { FlightPlanForm },
      setup() {
        const initialValues = ref<FlightPlanFormValues>({
          title: 'Scout Run',
          summary: '',
          body: 'Chart the nebula',
          category: 'project',
          location: '',
          eventDate: '',
          gallerySlides: [],
        });
        const submitting = ref(false);
        const handleSubmit = async (values: FlightPlanFormValues) => {
          submitting.value = true;
          await updateFlightPlan({
            auth: 'token',
            slug: 'scout-run',
            payload: values,
          });
          submitting.value = false;
        };
        return { initialValues, submitting, handleSubmit };
      },
      template: `
        <FlightPlanForm
          :initial-values="initialValues"
          :submitting="submitting"
          submit-label="Save mission"
          @submit="handleSubmit"
        />
      `,
    };

    const wrapper = mount(Harness);
    await wrapper.find('form').trigger('submit.prevent');
    expect(updateFlightPlan).toHaveBeenCalledTimes(1);
    await wrapper.find('form').trigger('submit.prevent');
    expect(updateFlightPlan).toHaveBeenCalledTimes(2);
  });
});
