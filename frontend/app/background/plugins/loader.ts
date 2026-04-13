// @ts-nocheck
// Legacy background plugin helper relies on untyped Three.js loader modules.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

const DRACO_DECODER_PATH = '/vendor/draco/';

export const createDracoGltfLoader = (): GLTFLoader => {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_DECODER_PATH);
  loader.setDRACOLoader(draco);
  return loader;
};
