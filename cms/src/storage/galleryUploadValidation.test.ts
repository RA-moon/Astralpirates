import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  GalleryUploadValidationError,
  validateGalleryUploadFile,
} from './galleryUploadValidation';

const MB = 1024 * 1024;

const buildImageFile = async ({
  name,
  width,
  height,
  type = 'image/png',
}: {
  name: string;
  width: number;
  height: number;
  type?: string;
}) => {
  const image = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 8, g: 16, b: 24 },
    },
  })
    .png()
    .toBuffer();

  return new File([new Uint8Array(image)], name, { type });
};

describe('validateGalleryUploadFile', () => {
  it('accepts small images without enforcing a minimum edge length', async () => {
    const file = await buildImageFile({
      name: 'small.png',
      width: 640,
      height: 360,
    });

    const result = await validateGalleryUploadFile({
      file,
      maxFileSizeBytes: 5 * MB,
    });

    expect(result.mimeType).toBe('image/png');
    expect(result.buffer.byteLength).toBeGreaterThan(0);
  });

  it('accepts 3d models when mime type is inferred from extension', async () => {
    const file = new File(['stub'], 'craft.glb', { type: 'application/octet-stream' });

    const result = await validateGalleryUploadFile({
      file,
      maxFileSizeBytes: 5 * MB,
    });

    expect(result.mimeType).toBe('model/gltf-binary');
  });

  it('accepts obj/gltf/stl files when browsers send generic mime types', async () => {
    const cases: Array<{ name: string; type: string; expectedMimeType: string }> = [
      { name: 'craft.obj', type: 'text/plain', expectedMimeType: 'model/obj' },
      { name: 'craft.gltf', type: 'application/json', expectedMimeType: 'model/gltf+json' },
      { name: 'craft.stl', type: 'application/sla', expectedMimeType: 'model/stl' },
    ];

    for (const testCase of cases) {
      const file = new File(['stub'], testCase.name, { type: testCase.type });
      const result = await validateGalleryUploadFile({
        file,
        maxFileSizeBytes: 5 * MB,
      });
      expect(result.mimeType).toBe(testCase.expectedMimeType);
    }
  });

  it('accepts supported audio uploads', async () => {
    const file = new File(['audio'], 'briefing.mp3', { type: 'audio/mpeg' });

    const result = await validateGalleryUploadFile({
      file,
      maxFileSizeBytes: 5 * MB,
    });

    expect(result.mimeType).toBe('audio/mpeg');
  });

  it('rejects audio uploads when audio is disabled', async () => {
    const file = new File(['audio'], 'briefing.mp3', { type: 'audio/mpeg' });

    await expect(
      validateGalleryUploadFile({
        file,
        maxFileSizeBytes: 5 * MB,
        allowAudio: false,
      }),
    ).rejects.toMatchObject({
      name: 'GalleryUploadValidationError',
      status: 400,
      message: 'Audio uploads are currently disabled.',
    } satisfies Partial<GalleryUploadValidationError>);
  });

  it('rejects files that exceed the configured max size', async () => {
    const oversized = new File([new Uint8Array(2 * MB)], 'large.jpg', { type: 'image/jpeg' });

    await expect(
      validateGalleryUploadFile({
        file: oversized,
        maxFileSizeBytes: MB,
      }),
    ).rejects.toMatchObject({
      name: 'GalleryUploadValidationError',
      status: 413,
      message: 'File exceeds the 1MB limit.',
    } satisfies Partial<GalleryUploadValidationError>);
  });

  it('rejects unsupported file types', async () => {
    const file = new File(['%PDF-1.7'], 'manual.pdf', { type: 'application/pdf' });

    await expect(
      validateGalleryUploadFile({
        file,
        maxFileSizeBytes: MB,
      }),
    ).rejects.toMatchObject({
      name: 'GalleryUploadValidationError',
      status: 400,
    } satisfies Partial<GalleryUploadValidationError>);
  });
});
