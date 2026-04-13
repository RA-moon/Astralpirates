import { describe, expect, it } from 'vitest';
import {
  createGallerySlideDraft,
  stripDraftMetadata,
  type FlightPlanGallerySlideDraft,
} from '~/components/flight-plans/types';

const createDraft = (
  patch: Partial<FlightPlanGallerySlideDraft> = {},
): FlightPlanGallerySlideDraft => ({
  localId: 'slide-1',
  label: '',
  title: '',
  description: '',
  mediaType: 'image',
  imageType: 'upload',
  imageUrl: '',
  imageAlt: 'Alt text',
  creditLabel: '',
  creditUrl: '',
  galleryImage: null,
  asset: null,
  uploadState: 'idle',
  errorMessage: '',
  ...patch,
});

describe('flight plan gallery slide draft helpers', () => {
  it('preserves explicit upload slides even when only imageUrl is present', () => {
    const draft = createGallerySlideDraft({
      imageType: 'upload',
      imageUrl: '/api/gallery-images/file/legacy.jpg',
      imageAlt: 'Legacy image',
      galleryImage: null,
    });

    expect(draft.imageType).toBe('upload');
    expect(draft.imageUrl).toBe('/api/gallery-images/file/legacy.jpg');
    expect(draft.galleryImage).toBeNull();
  });

  it('keeps upload drafts when a gallery asset id is present', () => {
    const draft = createGallerySlideDraft({
      imageType: 'upload',
      imageUrl: '/api/gallery-images/file/current.jpg',
      imageAlt: 'Current image',
      galleryImage: 42,
    });

    expect(draft.imageType).toBe('upload');
    expect(draft.imageUrl).toBe('/api/gallery-images/file/current.jpg');
    expect(draft.galleryImage).toBe(42);
  });

  it('accepts relation-object galleryImage values from legacy payloads', () => {
    const draft = createGallerySlideDraft({
      imageType: 'upload',
      imageAlt: 'Current image',
      galleryImage: { id: '42' } as any,
    });

    expect(draft.imageType).toBe('upload');
    expect(draft.galleryImage).toBe(42);
  });

  it('serializes explicit upload drafts without relation ids as upload slides', () => {
    const serialized = stripDraftMetadata([
      createDraft({
        imageType: 'upload',
        imageUrl: 'https://example.com/legacy.jpg',
        galleryImage: null,
      }),
    ]);

    expect(serialized).toEqual([
      expect.objectContaining({
        imageType: 'upload',
        imageUrl: 'https://example.com/legacy.jpg',
        galleryImage: null,
      }),
    ]);
  });
});
