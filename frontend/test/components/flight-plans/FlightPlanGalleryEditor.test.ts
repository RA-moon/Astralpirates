import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import FlightPlanGalleryEditor from '~/components/flight-plans/FlightPlanGalleryEditor.vue';
import { createGallerySlideDraft } from '~/components/flight-plans/types';

const { updateFlightPlanMock, deleteFlightPlanGalleryImageMock } = vi.hoisted(() => ({
  updateFlightPlanMock: vi.fn().mockResolvedValue({}),
  deleteFlightPlanGalleryImageMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('~/domains/flightPlans', () => ({
  updateFlightPlan: updateFlightPlanMock,
  deleteFlightPlanGalleryImage: deleteFlightPlanGalleryImageMock,
}));

vi.mock('~/stores/session', () => ({
  useSessionStore: () => ({
    bearerToken: null,
  }),
}));

describe('FlightPlanGalleryEditor', () => {
  beforeEach(() => {
    updateFlightPlanMock.mockReset();
    deleteFlightPlanGalleryImageMock.mockReset();
    updateFlightPlanMock.mockResolvedValue({});
    deleteFlightPlanGalleryImageMock.mockResolvedValue(undefined);
  });

  it('keeps slide removal in autosave mode even when remaining slides are incomplete', async () => {
    const wrapper = mount(FlightPlanGalleryEditor, {
      props: {
        flightPlanSlug: 'dome-project',
        baseRevision: 1,
        modelValue: [
          createGallerySlideDraft({
            imageType: 'upload',
            imageAlt: 'Valid upload',
            imageUrl: '/api/gallery-images/file/valid.jpg',
            galleryImage: 44,
            asset: { id: 44, url: '/api/gallery-images/file/valid.jpg' } as any,
          }),
          createGallerySlideDraft({
            imageType: 'upload',
            imageAlt: 'Missing file reference',
            imageUrl: '',
            galleryImage: null,
          }),
        ],
      },
    });

    await wrapper.findAll('.ui-accordion__trigger').at(0)?.trigger('click');
    await wrapper.get('[data-testid="gallery-remove-slide"]').trigger('click');
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    const updates = wrapper.emitted('update:modelValue') ?? [];
    expect(updates.at(-1)?.[0]).toHaveLength(1);
    expect(wrapper.text()).not.toContain('Slide removal was reverted.');
    expect(updateFlightPlanMock).toHaveBeenCalled();
  });

  it('emits an updated array when adding slides', async () => {
    const wrapper = mount(FlightPlanGalleryEditor, {
      props: {
        modelValue: [],
      },
    });

    await wrapper.get('[data-testid="gallery-add-slide"]').trigger('click');
    const updates = wrapper.emitted('update:modelValue') ?? [];
    expect(updates.at(-1)?.[0]).toHaveLength(1);
  });

  it('removes slides via the remove button', async () => {
    const wrapper = mount(FlightPlanGalleryEditor, {
      props: {
        modelValue: [
          createGallerySlideDraft({
            label: 'Slide A',
            imageUrl: 'https://example.com/a.jpg',
            imageAlt: 'A',
          }),
        ],
      },
    });

    await wrapper.get('.ui-accordion__trigger').trigger('click');
    await wrapper.get('[data-testid="gallery-remove-slide"]').trigger('click');
    const updates = wrapper.emitted('update:modelValue') ?? [];
    expect(updates.at(-1)?.[0]).toHaveLength(0);
  });

  it('reorders slides when move controls are used', async () => {
    const wrapper = mount(FlightPlanGalleryEditor, {
      props: {
        modelValue: [
          createGallerySlideDraft({
            label: 'Slide A',
            imageUrl: 'https://example.com/a.jpg',
            imageAlt: 'A',
          }),
          createGallerySlideDraft({
            label: 'Slide B',
            imageUrl: 'https://example.com/b.jpg',
            imageAlt: 'B',
          }),
        ],
      },
    });

    const triggers = wrapper.findAll('.ui-accordion__trigger');
    await triggers.at(0)?.trigger('click');
    await triggers.at(1)?.trigger('click');
    await wrapper.findAll('[data-testid="gallery-move-down"]').at(0)?.trigger('click');
    const updates = wrapper.emitted('update:modelValue') ?? [];
    const lastUpdate = updates.at(-1)?.[0] ?? [];
    expect(lastUpdate[0]?.label).toBe('Slide B');
    expect(lastUpdate[1]?.label).toBe('Slide A');
  });

  it('shows explicit reorder failure messaging when autosave fails after move', async () => {
    updateFlightPlanMock.mockRejectedValueOnce(new Error('Save failed'));

    const wrapper = mount(FlightPlanGalleryEditor, {
      props: {
        flightPlanSlug: 'dome-project',
        baseRevision: 1,
        modelValue: [
          createGallerySlideDraft({
            label: 'Slide A',
            imageType: 'upload',
            imageUrl: '/api/gallery-images/file/a.jpg',
            imageAlt: 'A',
            galleryImage: 11,
            asset: { id: 11, url: '/api/gallery-images/file/a.jpg' } as any,
          }),
          createGallerySlideDraft({
            label: 'Slide B',
            imageType: 'upload',
            imageUrl: '/api/gallery-images/file/b.jpg',
            imageAlt: 'B',
            galleryImage: 12,
            asset: { id: 12, url: '/api/gallery-images/file/b.jpg' } as any,
          }),
        ],
      },
    });

    const triggers = wrapper.findAll('.ui-accordion__trigger');
    await triggers.at(0)?.trigger('click');
    await wrapper.findAll('[data-testid="gallery-move-down"]').at(0)?.trigger('click');
    await nextTick();
    await vi.waitFor(() => {
      expect(updateFlightPlanMock).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain(
        'Save failed Slide order changed locally only and will revert after reload.',
      );
    });
  });

  it('appends slides provided by the uploader', async () => {
    const wrapper = mount(FlightPlanGalleryEditor, {
      props: {
        modelValue: [],
        flightPlanId: 9,
      },
    });

    const uploader = wrapper.findComponent({ name: 'FlightPlanGalleryUploader' });
    const uploaded = createGallerySlideDraft({
      label: 'Uploaded slide',
      imageUrl: 'https://example.com/uploaded.jpg',
      imageAlt: 'Uploaded',
    });

    uploader.vm.$emit('uploaded', [uploaded]);
    await nextTick();

    const updates = wrapper.emitted('update:modelValue') ?? [];
    expect(updates.at(-1)?.[0]).toHaveLength(1);
    expect(updates.at(-1)?.[0]?.[0]?.label).toBe('Uploaded slide');
  });

  it('deletes removed upload media after successful autosave', async () => {
    updateFlightPlanMock.mockResolvedValueOnce({});
    deleteFlightPlanGalleryImageMock.mockResolvedValueOnce(undefined);

    const wrapper = mount(FlightPlanGalleryEditor, {
      props: {
        flightPlanSlug: 'dome-project',
        baseRevision: 1,
        modelValue: [
          createGallerySlideDraft({
            imageType: 'upload',
            imageAlt: 'Uploaded media',
            imageUrl: '/api/gallery-images/file/upload.jpg',
            galleryImage: 91,
            asset: { id: 91, url: '/api/gallery-images/file/upload.jpg' } as any,
          }),
        ],
      },
    });

    await wrapper.get('.ui-accordion__trigger').trigger('click');
    await wrapper.get('[data-testid="gallery-remove-slide"]').trigger('click');
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();

    expect(updateFlightPlanMock).toHaveBeenCalled();
    expect(deleteFlightPlanGalleryImageMock).toHaveBeenCalledWith({
      auth: null,
      imageId: 91,
    });
  });

  it('blocks manual save when validation fails', async () => {
    const wrapper = mount(FlightPlanGalleryEditor, {
      props: {
        autoSave: false,
        flightPlanSlug: 'dome-project',
        baseRevision: 1,
        modelValue: [
          createGallerySlideDraft({
            imageType: 'upload',
            imageAlt: 'Missing file reference',
            imageUrl: '',
            galleryImage: null,
          }),
        ],
      },
    });

    await wrapper.get('[data-testid="gallery-add-slide"]').trigger('click');
    const updates = wrapper.emitted('update:modelValue') ?? [];
    const latestModelValue = updates.at(-1)?.[0];
    await wrapper.setProps({ modelValue: latestModelValue as any });
    await wrapper.get('[data-testid="gallery-save-button"]').trigger('click');
    await nextTick();

    expect(wrapper.text()).toContain('Slide 1: upload media (or switch to URL).');
    expect(updateFlightPlanMock).not.toHaveBeenCalled();
  });
});
