import { describe, expect, it } from 'vitest';

import { GALLERY_UPLOAD_MAX_FILE_SIZE_BYTES } from '~/modules/media/galleryMedia';
import {
  deriveGalleryMediaTitle,
  prepareGalleryUploadCandidate,
  resolveUploadedGalleryMediaType,
  validateGalleryUploadFile,
} from '~/modules/media/galleryUploadWorkflow';

describe('galleryUploadWorkflow helpers', () => {
  it('derives a readable title from filename', () => {
    expect(deriveGalleryMediaTitle('flying-concrete-table.glb')).toBe('flying concrete table');
    expect(deriveGalleryMediaTitle('.png')).toBe('Mission media');
  });

  it('rejects files larger than gallery upload limit', () => {
    const oversized = new File(
      [new Uint8Array(GALLERY_UPLOAD_MAX_FILE_SIZE_BYTES + 1)],
      'oversized.mp4',
      { type: 'video/mp4' },
    );

    expect(validateGalleryUploadFile(oversized)).toContain('File exceeds');
  });

  it('rejects unsupported file types', () => {
    const unsupported = new File(['pdf'], 'brochure.pdf', { type: 'application/pdf' });

    expect(validateGalleryUploadFile(unsupported)).toBe(
      'Unsupported file type. Use image, video, audio, or 3D model files.',
    );
  });

  it('accepts supported audio files', () => {
    const audio = new File(['audio'], 'briefing.mp3', { type: 'audio/mpeg' });

    expect(validateGalleryUploadFile(audio)).toBeNull();
  });

  it('prepares a valid upload candidate', async () => {
    const sourceFile = new File(['model'], 'ship.glb', { type: 'model/gltf-binary' });

    const prepared = await prepareGalleryUploadCandidate(sourceFile);

    expect(prepared.error).toBeNull();
    expect(prepared.candidate).not.toBeNull();
    expect(prepared.candidate?.sourceFile).toBe(sourceFile);
    expect(prepared.candidate?.uploadFile).toBe(sourceFile);
  });

  it('accepts obj/gltf/stl files when browsers send generic mime types', async () => {
    const objFile = new File(['model'], 'ship.obj', { type: 'text/plain' });
    const gltfFile = new File(['model'], 'ship.gltf', { type: 'application/json' });
    const stlFile = new File(['model'], 'ship.stl', { type: 'application/sla' });

    const objPrepared = await prepareGalleryUploadCandidate(objFile);
    const gltfPrepared = await prepareGalleryUploadCandidate(gltfFile);
    const stlPrepared = await prepareGalleryUploadCandidate(stlFile);

    expect(objPrepared.error).toBeNull();
    expect(gltfPrepared.error).toBeNull();
    expect(stlPrepared.error).toBeNull();
  });

  it('resolves uploaded media type from metadata fallback', () => {
    expect(
      resolveUploadedGalleryMediaType({
        assetMimeType: 'video/webm',
      }),
    ).toBe('video');
    expect(
      resolveUploadedGalleryMediaType({
        assetFilename: 'artifact.usdz',
      }),
    ).toBe('model');
    expect(
      resolveUploadedGalleryMediaType({
        imageUrl: 'https://artifact.example/preview.jpg',
      }),
    ).toBe('image');
  });

  it('overrides stale current image type when uploaded asset is model/video', () => {
    expect(
      resolveUploadedGalleryMediaType({
        currentMediaType: 'image',
        assetFilename: 'artifact.glb',
      }),
    ).toBe('model');
    expect(
      resolveUploadedGalleryMediaType({
        currentMediaType: 'image',
        assetMimeType: 'video/mp4',
      }),
    ).toBe('video');
  });

  it('keeps explicit non-image type when no upload hints are available', () => {
    expect(
      resolveUploadedGalleryMediaType({
        currentMediaType: 'model',
      }),
    ).toBe('model');
  });
});
