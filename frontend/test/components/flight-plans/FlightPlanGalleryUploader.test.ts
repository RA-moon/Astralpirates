import { describe, expect, it, vi, beforeEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import FlightPlanGalleryUploader from '~/components/flight-plans/FlightPlanGalleryUploader.vue';
import { uploadFlightPlanGalleryImage } from '~/domains/flightPlans';

vi.mock('~/domains/flightPlans', () => ({
  uploadFlightPlanGalleryImage: vi.fn(),
}));

const mockUpload = vi.mocked(uploadFlightPlanGalleryImage);

const createFile = (name: string, type = 'image/jpeg') => new File(['test'], name, { type });
const createFileOfSize = (name: string, type: string, sizeBytes: number) =>
  new File([new Uint8Array(sizeBytes)], name, { type });

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

describe('FlightPlanGalleryUploader', () => {
  beforeEach(() => {
    mockUpload.mockReset();
  });

  it('opens the file picker when the dropzone is clicked', async () => {
    const wrapper = mount(FlightPlanGalleryUploader, {
      props: {
        canUpload: true,
        authToken: 'token',
        flightPlanId: 7,
        remainingSlots: 1,
      },
    });

    const input = wrapper.get('input[type="file"]').element as HTMLInputElement;
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => undefined);

    await wrapper.get('[data-testid="gallery-dropzone"]').trigger('click');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });

  it('uploads dropped files and emits slide drafts', async () => {
    mockUpload.mockResolvedValue({
      asset: { id: 42, url: 'https://cdn.local/slide.jpg' },
      imageUrl: 'https://cdn.local/slide.jpg',
    });
    const wrapper = mount(FlightPlanGalleryUploader, {
      props: {
        canUpload: true,
        authToken: 'token',
        flightPlanId: 7,
        remainingSlots: 3,
      },
    });

    await wrapper.get('[data-testid="gallery-dropzone"]').trigger('drop', {
      dataTransfer: {
        files: [createFile('slide-one.jpg')],
      },
    });
    await flushPromises();

    expect(mockUpload).toHaveBeenCalledTimes(1);
    const uploaded = wrapper.emitted('uploaded')?.[0]?.[0] ?? [];
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]?.imageType).toBe('upload');
    expect(uploaded[0]?.mediaType).toBe('image');
    expect(uploaded[0]?.galleryImage).toBe(42);
  });

  it('uploads when auth token is missing but mission context is available', async () => {
    mockUpload.mockResolvedValue({
      asset: { id: 44, url: 'https://cdn.local/slide.jpg' },
      imageUrl: 'https://cdn.local/slide.jpg',
    });
    const wrapper = mount(FlightPlanGalleryUploader, {
      props: {
        canUpload: true,
        flightPlanId: 7,
        remainingSlots: 1,
      },
    });

    await wrapper.get('[data-testid="gallery-dropzone"]').trigger('drop', {
      dataTransfer: {
        files: [createFile('slide-one.jpg')],
      },
    });
    await flushPromises();

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: null,
        flightPlanId: 7,
      }),
    );
  });

  it('accepts video uploads and marks media type as video', async () => {
    mockUpload.mockResolvedValue({
      asset: { id: 72, url: 'https://cdn.local/clip.mp4', mimeType: 'video/mp4' },
      imageUrl: 'https://cdn.local/clip.mp4',
    });

    const wrapper = mount(FlightPlanGalleryUploader, {
      props: {
        canUpload: true,
        authToken: 'token',
        flightPlanId: 7,
        remainingSlots: 3,
      },
    });

    await wrapper.get('[data-testid="gallery-dropzone"]').trigger('drop', {
      dataTransfer: {
        files: [createFile('clip.mp4', 'video/mp4')],
      },
    });
    await flushPromises();

    const uploaded = wrapper.emitted('uploaded')?.[0]?.[0] ?? [];
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]?.mediaType).toBe('video');
  });

  it('shows an error when the gallery is already full', async () => {
    const wrapper = mount(FlightPlanGalleryUploader, {
      props: {
        canUpload: true,
        authToken: 'token',
        flightPlanId: 7,
        remainingSlots: 0,
      },
    });

    await wrapper.get('[data-testid="gallery-dropzone"]').trigger('drop', {
      dataTransfer: {
        files: [createFile('full.jpg')],
      },
    });
    await flushPromises();

    expect(mockUpload).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Gallery is full');
  });

  it('rejects unsupported file types before upload', async () => {
    const wrapper = mount(FlightPlanGalleryUploader, {
      props: {
        canUpload: true,
        authToken: 'token',
        flightPlanId: 7,
        remainingSlots: 1,
      },
    });

    await wrapper.get('[data-testid="gallery-dropzone"]').trigger('drop', {
      dataTransfer: {
        files: [createFileOfSize('diagram.svg', 'image/svg+xml', 1024)],
      },
    });
    await flushPromises();

    expect(mockUpload).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Unsupported file type');
  });

  it('rejects files larger than the configured gallery upload limit', async () => {
    const wrapper = mount(FlightPlanGalleryUploader, {
      props: {
        canUpload: true,
        authToken: 'token',
        flightPlanId: 7,
        remainingSlots: 1,
      },
    });

    await wrapper.get('[data-testid="gallery-dropzone"]').trigger('drop', {
      dataTransfer: {
        files: [createFileOfSize('too-big.jpg', 'image/jpeg', 26 * 1024 * 1024)],
      },
    });
    await flushPromises();

    expect(mockUpload).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('File exceeds the 25MB limit');
  });

  it('rejects new drops while an upload is already in progress', async () => {
    const deferred = createDeferred<any>();
    mockUpload.mockReturnValue(deferred.promise);

    const wrapper = mount(FlightPlanGalleryUploader, {
      props: {
        canUpload: true,
        authToken: 'token',
        flightPlanId: 7,
        remainingSlots: 3,
      },
    });

    await wrapper.get('[data-testid="gallery-dropzone"]').trigger('drop', {
      dataTransfer: {
        files: [createFile('first.jpg')],
      },
    });
    await flushPromises();
    expect(mockUpload).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-testid="gallery-dropzone"]').trigger('drop', {
      dataTransfer: {
        files: [createFile('second.jpg')],
      },
    });
    await flushPromises();
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('Upload already in progress.');

    deferred.resolve({
      asset: { id: 99, url: 'https://cdn.local/first.jpg' },
      imageUrl: 'https://cdn.local/first.jpg',
    });
    await flushPromises();
  });
});
