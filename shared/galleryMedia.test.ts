import assert from 'node:assert/strict';
import test from 'node:test';

import { isEmbeddableModelUrl } from './galleryMedia';

test('isEmbeddableModelUrl only allows GLB model URLs', () => {
  assert.equal(isEmbeddableModelUrl('/media/models/ship.glb'), true);
  assert.equal(isEmbeddableModelUrl('/media/models/ship.glb?download=1'), true);
  assert.equal(isEmbeddableModelUrl('/media/models/ship.gltf'), false);
  assert.equal(isEmbeddableModelUrl('/media/models/ship.obj'), false);
  assert.equal(isEmbeddableModelUrl(''), false);
});
