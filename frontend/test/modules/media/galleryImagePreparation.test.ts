import { afterEach, describe, expect, it, vi } from 'vitest';

import { prepareGalleryFileForUpload } from '~/modules/media/galleryImagePreparation';

const originalCreateImageBitmap = (globalThis as { createImageBitmap?: unknown }).createImageBitmap;

const setCreateImageBitmap = (value: unknown) => {
  Object.defineProperty(globalThis, 'createImageBitmap', {
    value,
    configurable: true,
    writable: true,
  });
};

const mockCanvasElement = ({
  blobSize,
  blobType,
}: {
  blobSize: number;
  blobType: string;
}) => {
  const nativeCreateElement = document.createElement.bind(document);
  const drawImage = vi.fn();
  const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation(
    ((tagName: string, options?: ElementCreationOptions) => {
      if (tagName !== 'canvas') {
        return nativeCreateElement(tagName, options);
      }

      const canvas = nativeCreateElement('canvas', options) as HTMLCanvasElement;
      Object.defineProperty(canvas, 'getContext', {
        value: vi.fn(() => ({ drawImage })),
        configurable: true,
      });
      Object.defineProperty(canvas, 'toBlob', {
        value: (callback: (blob: Blob | null) => void) => {
          callback(new Blob([new Uint8Array(blobSize)], { type: blobType }));
        },
        configurable: true,
      });
      return canvas;
    }) as typeof document.createElement,
  );

  return { createElementSpy, drawImage };
};

afterEach(() => {
  vi.restoreAllMocks();
  if (originalCreateImageBitmap === undefined) {
    delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
    return;
  }
  setCreateImageBitmap(originalCreateImageBitmap);
});

describe('prepareGalleryFileForUpload', () => {
  it('leaves non-image files untouched', async () => {
    const file = new File(['stub'], 'mission.glb', { type: 'model/gltf-binary' });

    const result = await prepareGalleryFileForUpload(file);

    expect(result.optimized).toBe(false);
    expect(result.file).toBe(file);
  });

  it('optimizes large jpeg images when output is smaller', async () => {
    const close = vi.fn();
    setCreateImageBitmap(
      vi.fn(async () => ({
        width: 4096,
        height: 2304,
        close,
      })),
    );
    const { createElementSpy, drawImage } = mockCanvasElement({
      blobSize: 300_000,
      blobType: 'image/webp',
    });
    const file = new File([new Uint8Array(2_000_000)], 'hangar-shot.jpg', { type: 'image/jpeg' });

    const result = await prepareGalleryFileForUpload(file);

    expect(result.optimized).toBe(true);
    expect(result.file).not.toBe(file);
    expect(result.file.type).toBe('image/webp');
    expect(result.file.name).toBe('hangar-shot.webp');
    expect(result.file.size).toBe(300_000);
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    createElementSpy.mockRestore();
  });

  it('keeps original image when optimization is not smaller', async () => {
    setCreateImageBitmap(
      vi.fn(async () => ({
        width: 3200,
        height: 1800,
        close: vi.fn(),
      })),
    );
    const { createElementSpy } = mockCanvasElement({
      blobSize: 2_500_000,
      blobType: 'image/webp',
    });
    const file = new File([new Uint8Array(2_000_000)], 'bridge.jpg', { type: 'image/jpeg' });

    const result = await prepareGalleryFileForUpload(file);

    expect(result.optimized).toBe(false);
    expect(result.file).toBe(file);
    createElementSpy.mockRestore();
  });
});
