<template>
  <div ref="containerEl" class="ui-model-viewer">
    <canvas
      ref="canvasEl"
      class="ui-model-viewer__canvas"
      role="img"
      :aria-label="alt"
    />
    <div v-if="loading" class="ui-model-viewer__status">Loading 3D model...</div>
    <div v-else-if="errorMessage" class="ui-model-viewer__status ui-model-viewer__status--error">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({
  src: {
    type: String,
    required: true,
  },
  alt: {
    type: String,
    default: '3D model preview',
  },
});

const containerEl = ref(null);
const canvasEl = ref(null);
const loading = ref(true);
const errorMessage = ref('');

let rafId = 0;
let removeResizeListener = null;
let renderer = null;
let controls = null;
let scene = null;

const isThreeObject3D = (candidate) => {
  if (!candidate || typeof candidate !== 'object') return false;
  return Boolean(candidate.isObject3D);
};

const isThreeTexture = (candidate) => {
  if (!candidate || typeof candidate !== 'object') return false;
  return Boolean(candidate.isTexture);
};

const disposeMaterial = (material) => {
  const candidate = material;
  for (const value of Object.values(candidate)) {
    if (isThreeTexture(value)) {
      value.dispose();
    }
  }
  material.dispose();
};

const cleanupSceneObjects = () => {
  if (!scene) return;
  scene.traverse((object) => {
    if (!isThreeObject3D(object)) return;
    const mesh = object;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    const meshMaterial = mesh.material;
    if (Array.isArray(meshMaterial)) {
      meshMaterial.forEach((material) => disposeMaterial(material));
    } else if (meshMaterial) {
      disposeMaterial(meshMaterial);
    }
  });
};

const stopAnimation = () => {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
};

const cleanupViewer = () => {
  stopAnimation();

  if (removeResizeListener) {
    removeResizeListener();
    removeResizeListener = null;
  }

  if (controls) {
    controls.dispose();
    controls = null;
  }

  cleanupSceneObjects();

  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer = null;
  }

  scene = null;
};

const initViewer = async () => {
  const container = containerEl.value;
  const canvas = canvasEl.value;
  if (!container || !canvas) {
    loading.value = false;
    errorMessage.value = 'Model preview unavailable.';
    return;
  }

  try {
    const [three, controlsModule, gltfLoaderModule] = await Promise.all([
      import('three'),
      import('three/examples/jsm/controls/OrbitControls.js'),
      import('three/examples/jsm/loaders/GLTFLoader.js'),
    ]);

    const { OrbitControls } = controlsModule;
    const { GLTFLoader } = gltfLoaderModule;

    const localScene = new three.Scene();
    const localCamera = new three.PerspectiveCamera(45, 1, 0.1, 1000);
    localCamera.position.set(0, 0, 4);

    const localRenderer = new three.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    localRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const ambient = new three.HemisphereLight(0xffffff, 0x445566, 1.1);
    const key = new three.DirectionalLight(0xffffff, 1.25);
    key.position.set(6, 10, 8);
    localScene.add(ambient, key);

    const localControls = new OrbitControls(localCamera, localRenderer.domElement);
    localControls.enableDamping = true;
    localControls.enablePan = false;
    localControls.minDistance = 0.8;
    localControls.maxDistance = 20;

    const resize = () => {
      const width = Math.max(container.clientWidth || 1, 1);
      const height = Math.max(container.clientHeight || 1, 1);
      localRenderer.setSize(width, height, false);
      localCamera.aspect = width / height;
      localCamera.updateProjectionMatrix();
    };

    resize();
    window.addEventListener('resize', resize);
    removeResizeListener = () => window.removeEventListener('resize', resize);

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(props.src);
    const model = gltf.scene;
    localScene.add(model);

    const box = new three.Box3().setFromObject(model);
    const center = box.getCenter(new three.Vector3());
    const size = box.getSize(new three.Vector3());
    model.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z, 0.01);
    const targetDistance = Math.max(maxDim * 1.6, 2.2);
    localCamera.position.set(maxDim * 0.8, maxDim * 0.6, targetDistance);
    localCamera.lookAt(0, 0, 0);
    localControls.target.set(0, 0, 0);
    localControls.update();

    const renderLoop = () => {
      localControls.update();
      localRenderer.render(localScene, localCamera);
      rafId = requestAnimationFrame(renderLoop);
    };
    renderLoop();

    renderer = localRenderer;
    controls = localControls;
    scene = localScene;

    loading.value = false;
  } catch (error) {
    cleanupViewer();
    loading.value = false;
    errorMessage.value = 'Unable to render 3D preview.';
    // eslint-disable-next-line no-console
    console.warn('[UiModelViewer3D] failed to initialize', error);
  }
};

onMounted(async () => {
  await nextTick();
  void initViewer();
});

onBeforeUnmount(() => {
  cleanupViewer();
});
</script>

<style scoped>
.ui-model-viewer {
  --ui-model-viewer-min-height: calc(var(--size-base-layout-px) * 320 * var(--size-scale-factor));
  --ui-model-viewer-status-bottom: var(--space-sm);
  --ui-model-viewer-status-font-size: calc(var(--size-base-layout-px) * 13.6 * var(--size-scale-factor));
  --ui-model-viewer-status-shadow-y: var(--size-base-layout-px);
  --ui-model-viewer-status-shadow-blur: calc(var(--size-base-layout-px) * 3);
  position: relative;
  width: 100%;
  min-height: var(--ui-model-viewer-min-height);
  background: color-mix(in srgb, var(--color-surface-base) 84%, #02050b);
}

.ui-model-viewer__canvas {
  width: 100%;
  height: 100%;
  min-height: var(--ui-model-viewer-min-height);
  display: block;
}

.ui-model-viewer__status {
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--ui-model-viewer-status-bottom);
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--ui-model-viewer-status-font-size);
  text-shadow: 0 var(--ui-model-viewer-status-shadow-y) var(--ui-model-viewer-status-shadow-blur) rgba(0, 0, 0, 0.45);
}

.ui-model-viewer__status--error {
  color: var(--color-danger);
}
</style>
