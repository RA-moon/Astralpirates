// @ts-nocheck
// Legacy background plugin relies on dynamic data; keep untyped for now.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  COLOR_HUE_SPEED_RANGE,
  DEFAULT_COLOR_SATURATION,
  DEFAULT_VALUES_SETTINGS,
  SHEEN_HUE_SPEED_RANGE,
} from '../settings';
import type { ValuesSettings } from '../types';
import { createDracoGltfLoader } from './loader';

const DEFAULT_MODEL_URL = '/assets/models/values.glb';
const ROT_SPEED_MIN_DEG = -20;
const ROT_SPEED_MAX_DEG = 20;
const COLOR_LIGHTNESS = 0.1;
const DEFAULT_MAX_ROT_SPEED = Math.PI * 0.6;
const BASE_ROT_DAMP = 1.8;
const BASE_ROT_DURATION_RANGE = { min: 4, max: 9 };
const POINTER_DISTANCE_NORMALIZER = 160;
const POINTER_TARGET_BLEND = 0.35;
const POINTER_INPUT_GAIN = 0.5;
const POINTER_SPEED_DAMP = 6;
const POINTER_DECAY_DAMP = 0.9;
const POINTER_DECAY_IDLE_MULT = 4;
const INPUT_DECAY_DURATION = 1;
const DEFAULT_POINTER_MULTIPLIER = Math.PI;

function triangleWave01(normalized: number) {
  const t = normalized % 1;
  return t <= 0.5 ? t * 2 : (1 - t) * 2;
}

function defaultSheenHueSpeed(now = Date.now()) {
  const date = new Date(now);
  const seconds = date.getSeconds() + date.getMilliseconds() / 1000;
  const normalized = (seconds % 60) / 60;
  const wave = triangleWave01(normalized);
  return SHEEN_HUE_SPEED_RANGE.min + (SHEEN_HUE_SPEED_RANGE.max - SHEEN_HUE_SPEED_RANGE.min) * wave;
}

function defaultColorHueSpeed(now = Date.now()) {
  const date = new Date(now);
  const minutes = date.getMinutes() + date.getSeconds() / 60;
  const normalized = (minutes % 60) / 60;
  const wave = triangleWave01(normalized);
  return COLOR_HUE_SPEED_RANGE.min + (COLOR_HUE_SPEED_RANGE.max - COLOR_HUE_SPEED_RANGE.min) * wave;
}

export class ValuesIcon {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  requestFrame: () => void;
  scaleMultiplier: number;
  modelUrl: string;
  rotationSpeedRange: { min: number; max: number };
  maxRotationSpeedConfig: number;
  pointerSpeedMultiplierConfig: number;
  configPositionOffset: { x: number; y: number; z: number };
  reduceMotion: boolean;
  alwaysAnimate: boolean;
  anchor: THREE.Group;
  group: THREE.Group;
  anchorOffset: THREE.Vector3;
  parts: Array<THREE.Mesh | THREE.InstancedMesh>;
  viewport: { width: number; height: number };
  measure: {
    baseSize: number | null;
    lastViewWidth: number | null;
    lastViewHeight: number | null;
    baseOffset: THREE.Vector3;
  };

  ready: boolean;
  camRight: THREE.Vector3;
  camUp: THREE.Vector3;
  camForward: THREE.Vector3;
  randomAxisScratch: THREE.Vector3;
  pointerWorking: THREE.Vector3;
  sheenHue: number;
  sheenColor: THREE.Color;
  colorHue: number;
  colorBase: THREE.Color;
  baseMaterial: THREE.MeshPhysicalMaterial;
  loader: GLTFLoader;
  baseRotationCurrent: THREE.Vector3;
  baseRotationTarget: THREE.Vector3;
  rotationSpeed: THREE.Vector3;
  baseRotationTimer: number;
  baseRotationDuration: number;
  pointerSpeedTarget: THREE.Vector3;
  pointerSpeedCurrent: THREE.Vector3;
  lastPointer: { x: number | null; y: number | null };
  canvasBounds: DOMRect | null;
  inputDecayTimer: number;

  constructor({
    scene,
    camera,
    renderer,
    valuesSettings = {},
    requestFrame,
  }: {
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    renderer: THREE.WebGLRenderer;
    valuesSettings?: Partial<ValuesSettings>;
    requestFrame?: () => void;
  }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.requestFrame = typeof requestFrame === 'function' ? requestFrame : () => {};

    const {
      scaleMultiplier = DEFAULT_VALUES_SETTINGS.scaleMultiplier,
      modelUrl = DEFAULT_MODEL_URL,
      rotationSpeedRange = { min: ROT_SPEED_MIN_DEG, max: ROT_SPEED_MAX_DEG },
      positionOffset = DEFAULT_VALUES_SETTINGS.positionOffset,
      maxRotationSpeed = DEFAULT_VALUES_SETTINGS.maxRotationSpeed,
      pointerSpeedMultiplier = DEFAULT_VALUES_SETTINGS.pointerSpeedMultiplier,
      reduceMotion = DEFAULT_VALUES_SETTINGS.reduceMotion,
    } = valuesSettings;

    this.scaleMultiplier = scaleMultiplier;
    this.modelUrl = modelUrl;
    this.rotationSpeedRange = rotationSpeedRange;
    this.maxRotationSpeedConfig = Number(maxRotationSpeed) || DEFAULT_MAX_ROT_SPEED;
    this.pointerSpeedMultiplierConfig =
      Number(pointerSpeedMultiplier) || DEFAULT_POINTER_MULTIPLIER;
    this.configPositionOffset = {
      x: Number(positionOffset?.x) || 0,
      y: Number(positionOffset?.y) || 0,
      z: Number(positionOffset?.z) || 0,
    };

    this.reduceMotion = reduceMotion === true;
    this.alwaysAnimate = !this.reduceMotion;

    this.anchor = new THREE.Group();
    this.anchor.renderOrder = 5;
    this.scene.add(this.anchor);
    this.group = new THREE.Group();
    this.group.renderOrder = 5;
    this.anchor.add(this.group);

    this.anchorOffset = new THREE.Vector3();
    this.anchor.position.copy(this.resolveAnchorOffset());

    this.parts = [];
    this.viewport = { width: 0, height: 0 };

    this.measure = {
      baseSize: null,
      lastViewWidth: null,
      lastViewHeight: null,
      baseOffset: new THREE.Vector3(),
    };

    this.ready = false;

    this.camRight = new THREE.Vector3();
    this.camUp = new THREE.Vector3();
    this.camForward = new THREE.Vector3();
    this.randomAxisScratch = new THREE.Vector3();
    this.pointerWorking = new THREE.Vector3();
    this.sheenHue = 0;
    this.sheenColor = new THREE.Color().setHSL(0, 1, 0.5);
    this.colorHue = 0;
    this.colorBase = new THREE.Color().setHSL(0, DEFAULT_COLOR_SATURATION, COLOR_LIGHTNESS);

    this.baseMaterial = new THREE.MeshPhysicalMaterial({
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      side: THREE.FrontSide,
      color: 0x888888,
      emissive: 0x000000,
      roughness: 0.12,
      metalness: 0.7,
      transmission: 1,
      ior: 1.45,
      reflectivity: 0.9,
      sheen: 1,
      sheenRoughness: 0,
      sheenColor: new THREE.Color(0xA329B3),
      clearcoat: 1,
      clearcoatRoughness: 0,
      envMapIntensity: 1.0,
    });

    this.loader = createDracoGltfLoader();

    this.baseRotationCurrent = new THREE.Vector3();
    this.baseRotationTarget = new THREE.Vector3();
    this.rotationSpeed = new THREE.Vector3();
    this.baseRotationTimer = 0;
    this.baseRotationDuration = 0;
    this.pickNewBaseRotationTarget(true);

    this.pointerSpeedTarget = new THREE.Vector3();
    this.pointerSpeedCurrent = new THREE.Vector3();
    this.lastPointer = { x: null, y: null };
    this.canvasBounds = null;
    this.inputDecayTimer = INPUT_DECAY_DURATION;
  }

  async init() {
    try {
      await this.loadModel();
    } catch {
      this.fallback();
    }
    this.ready = true;
    this.updateAfterViewport();
  }

  async loadModel() {
    return new Promise((resolve, reject) => {
      this.loader.load(
        this.modelUrl,
        (gltf) => {
          const root = gltf.scene;
          root.updateWorldMatrix(true, true);
          const P = new THREE.Vector3();
          const Q = new THREE.Quaternion();
          const S = new THREE.Vector3();

          root.traverse((o) => {
            if ((o.isMesh || o.isSkinnedMesh) && o.geometry) {
              const geometry = o.geometry.clone();
              if (!geometry.attributes.normal) geometry.computeVertexNormals();
              const mesh = new THREE.Mesh(geometry, this.baseMaterial.clone());
              o.matrixWorld.decompose(P, Q, S);
              mesh.position.copy(P);
              mesh.quaternion.copy(Q);
              mesh.scale.copy(S);
              mesh.updateMatrixWorld(true);
              if (mesh.material?.color) {
                mesh.material.color.copy(this.colorBase);
              }
              mesh.renderOrder = 5;
              this.parts.push(mesh);
              this.group.add(mesh);
            } else if (o.isInstancedMesh && o.geometry) {
              const baseGeometry = o.geometry.clone();
              if (!baseGeometry.attributes.normal) baseGeometry.computeVertexNormals();
              const material = this.baseMaterial.clone();
              if (material.color) {
                material.color.copy(this.colorBase);
              }
              const instanced = new THREE.InstancedMesh(baseGeometry, material, o.count);
              const MW = new THREE.Matrix4();
              const world = new THREE.Matrix4();
              for (let i = 0; i < o.count; i++) {
                o.getMatrixAt(i, MW);
                world.copy(o.matrixWorld).multiply(MW);
                instanced.setMatrixAt(i, world);
              }
              instanced.instanceMatrix.needsUpdate = true;
              instanced.renderOrder = 5;
              this.parts.push(instanced);
              this.group.add(instanced);
            }
          });

          if (this.parts.length === 0) {
            this.fallback();
          } else {
            this.prepareGroup();
          }
          resolve();
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  fallback() {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const mesh = new THREE.Mesh(geometry, this.baseMaterial.clone());
    if (mesh.material?.color) {
      mesh.material.color.copy(this.colorBase);
    }
    mesh.renderOrder = 5;
    this.parts.push(mesh);
    this.group.add(mesh);
    this.prepareGroup();
  }

  prepareGroup() {
    if (this.parts.length === 0) return;
    this.anchor.position.set(0, 0, 0);
    this.anchor.quaternion.identity();
    this.group.position.set(0, 0, 0);
    this.group.scale.setScalar(1);
    this.group.updateMatrixWorld(true);

    this.recenterGroup({ preserveRotation: false });

    const alignedBox = new THREE.Box3().setFromObject(this.group);
    const size = alignedBox.getSize(new THREE.Vector3());
    const largestExtent = Math.max(size.x, size.y, size.z);

    // Scale translucency parameters with the model size for a glass-like volume.
    const targetThickness = Math.max(0.2, largestExtent * 0.35);
    const tintDistance = Math.max(0.75, largestExtent * 0.9);
    for (const mesh of this.parts) {
      if (mesh.material?.isMeshPhysicalMaterial) {
        mesh.material.thickness = targetThickness;
        mesh.material.attenuationDistance = tintDistance;
        mesh.material.needsUpdate = true;
      }
    }

    this.measure.baseSize = largestExtent || 1;
    this.measure.lastViewWidth = null;
    this.measure.lastViewHeight = null;

    const anchorOffset = this.resolveAnchorOffset();
    this.anchor.position.copy(anchorOffset);
    this.anchor.updateMatrixWorld(true);
  }

  onResize(viewW, viewH) {
    this.viewport.width = viewW;
    this.viewport.height = viewH;
    this.updateScale(viewW, viewH);
    this.positionGroup();
  }

  onCameraMove() {
    this.positionGroup();
  }

  onFrame(delta) {
    if (!this.ready) return;
    const anchorOffset = this.resolveAnchorOffset();
    if (!this.anchor.position.equals(anchorOffset)) {
      this.anchor.position.copy(anchorOffset);
      this.anchor.updateMatrixWorld(true);
    }
    const scale =
      typeof window !== 'undefined' && typeof window.value_rotation_speed === 'number'
        ? window.value_rotation_speed
        : 1;

    const maxRotationSpeed = this.resolveMaxRotationSpeed();

    this.baseRotationTimer += delta;
    if (this.baseRotationTimer >= this.baseRotationDuration) {
      this.pickNewBaseRotationTarget();
    }

    this.baseRotationCurrent.x = THREE.MathUtils.damp(
      this.baseRotationCurrent.x,
      this.baseRotationTarget.x,
      BASE_ROT_DAMP,
      delta,
    );
    this.baseRotationCurrent.y = THREE.MathUtils.damp(
      this.baseRotationCurrent.y,
      this.baseRotationTarget.y,
      BASE_ROT_DAMP,
      delta,
    );
    this.baseRotationCurrent.z = THREE.MathUtils.damp(
      this.baseRotationCurrent.z,
      this.baseRotationTarget.z,
      BASE_ROT_DAMP,
      delta,
    );
    this.clampRotationVector(this.baseRotationCurrent, maxRotationSpeed);

    this.inputDecayTimer = Math.min(this.inputDecayTimer + delta, INPUT_DECAY_DURATION * 4);
    const idleRatio =
      INPUT_DECAY_DURATION > 0
        ? THREE.MathUtils.clamp(this.inputDecayTimer / INPUT_DECAY_DURATION, 0, 1)
        : 1;
    const pointerDecayRate =
      POINTER_DECAY_DAMP * THREE.MathUtils.lerp(1, POINTER_DECAY_IDLE_MULT, idleRatio);

    this.pointerSpeedTarget.x = THREE.MathUtils.damp(
      this.pointerSpeedTarget.x,
      0,
      pointerDecayRate,
      delta,
    );
    this.pointerSpeedTarget.y = THREE.MathUtils.damp(
      this.pointerSpeedTarget.y,
      0,
      pointerDecayRate,
      delta,
    );
    this.pointerSpeedTarget.z = THREE.MathUtils.damp(
      this.pointerSpeedTarget.z,
      0,
      pointerDecayRate,
      delta,
    );

    this.pointerSpeedCurrent.x = THREE.MathUtils.damp(
      this.pointerSpeedCurrent.x,
      this.pointerSpeedTarget.x,
      POINTER_SPEED_DAMP,
      delta,
    );
    this.pointerSpeedCurrent.y = THREE.MathUtils.damp(
      this.pointerSpeedCurrent.y,
      this.pointerSpeedTarget.y,
      POINTER_SPEED_DAMP,
      delta,
    );
    this.pointerSpeedCurrent.z = THREE.MathUtils.damp(
      this.pointerSpeedCurrent.z,
      this.pointerSpeedTarget.z,
      POINTER_SPEED_DAMP,
      delta,
    );

    this.rotationSpeed.copy(this.baseRotationCurrent).add(this.pointerSpeedCurrent);
    this.anchor.rotation.x += this.rotationSpeed.x * delta * scale;
    this.anchor.rotation.y += this.rotationSpeed.y * delta * scale;
    this.anchor.rotation.z += this.rotationSpeed.z * delta * scale;

    const hueSpeedSource = typeof window !== 'undefined' ? window.hue_sheen_speed : undefined;
    const hueSpeed = typeof hueSpeedSource === 'number' ? hueSpeedSource : defaultSheenHueSpeed();
    const colorSpeedSource = typeof window !== 'undefined' ? window.color_hue_speed : undefined;
    const colorSpeed =
      typeof colorSpeedSource === 'number' ? colorSpeedSource : defaultColorHueSpeed();
    const colorSaturation =
      typeof window !== 'undefined' && typeof window.color_saturation === 'number'
        ? window.color_saturation
        : DEFAULT_COLOR_SATURATION;

    this.sheenHue = (this.sheenHue + delta * hueSpeed) % 1;
    const sheenColor = this.sheenColor.setHSL(this.sheenHue, 1, 0.5);

    this.colorHue = (this.colorHue + delta * colorSpeed) % 1;
    const baseColor = this.colorBase.setHSL(
      this.colorHue,
      THREE.MathUtils.clamp(colorSaturation, 0, 1),
      COLOR_LIGHTNESS,
    );

    for (const mesh of this.parts) {
      if (mesh.material?.sheenColor) {
        mesh.material.sheenColor.copy(sheenColor);
      }
      if (mesh.material?.color) {
        mesh.material.color.copy(baseColor);
      }
    }
  }

  updateScale(viewW, viewH) {
    if (viewW === this.measure.lastViewWidth && viewH === this.measure.lastViewHeight) return;
    const widthWorld = Math.abs(this.camera.right - this.camera.left);
    const heightWorld = Math.abs(this.camera.top - this.camera.bottom);
    if (!widthWorld || !heightWorld) return;

    const targetWorld = Math.min(widthWorld / 3, heightWorld / 3);
    const baseSize = this.measure.baseSize || 1;
    const scale = (targetWorld / baseSize) * this.scaleMultiplier;

    this.measure.lastViewWidth = viewW;
    this.measure.lastViewHeight = viewH;
    this.group.scale.setScalar(scale);
    this.group.updateMatrixWorld(true);
    this.recenterGroup({ preserveRotation: true });
  }

  positionGroup() {
    this.group.position.copy(this.measure.baseOffset);
    this.group.updateMatrixWorld(true);
    const anchorOffset = this.resolveAnchorOffset();
    this.anchor.position.copy(anchorOffset);
    this.anchor.updateMatrixWorld(true);
  }

  resolveAnchorOffset() {
    let source = this.configPositionOffset;
    if (typeof window !== 'undefined') {
      const winOffset = window.values_position_offset;
      if (winOffset && typeof winOffset === 'object') {
        source = winOffset;
      }
    }

    this.anchorOffset.set(Number(source?.x) || 0, Number(source?.y) || 0, Number(source?.z) || 0);

    return this.anchorOffset;
  }

  resolveMaxRotationSpeed() {
    if (typeof window !== 'undefined') {
      const raw = Number(window.values_max_rotation_speed);
      if (Number.isFinite(raw) && raw > 0) {
        return Math.min(raw, Math.PI * 10);
      }
    }
    return Math.max(this.maxRotationSpeedConfig, Math.PI * 0.01);
  }

  resolvePointerMultiplier() {
    if (typeof window !== 'undefined') {
      const raw = Number(window.values_pointer_rotation_scale);
      if (Number.isFinite(raw) && raw > 0) {
        return raw;
      }
    }
    return Math.max(this.pointerSpeedMultiplierConfig, Math.PI * 0.01);
  }

  clampRotationVector(vector, maxSum) {
    const absSum = Math.abs(vector.x) + Math.abs(vector.y) + Math.abs(vector.z);
    if (!Number.isFinite(absSum) || absSum === 0 || absSum <= maxSum) return vector;
    const scale = maxSum / absSum;
    if (!Number.isFinite(scale) || scale <= 0) {
      vector.set(0, 0, 0);
      return vector;
    }
    vector.multiplyScalar(scale);
    return vector;
  }

  randomUnitVector(target = this.randomAxisScratch) {
    let x = Math.random() * 2 - 1;
    let y = Math.random() * 2 - 1;
    let z = Math.random() * 2 - 1;
    let lengthSq = x * x + y * y + z * z;
    if (lengthSq < 1e-4) {
      x = 1;
      y = 0;
      z = 0;
      lengthSq = 1;
    }
    const invLen = 1 / Math.sqrt(lengthSq);
    target.set(x * invLen, y * invLen, z * invLen);
    return target;
  }

  randomBaseRotationDuration() {
    const min = BASE_ROT_DURATION_RANGE?.min ?? 4;
    const max = BASE_ROT_DURATION_RANGE?.max ?? 9;
    return THREE.MathUtils.randFloat(min, Math.max(min, max));
  }

  randomBaseRotationVector(maxSpeed) {
    const axis = this.randomUnitVector();
    const minDeg = Math.abs(this.rotationSpeedRange?.min ?? ROT_SPEED_MIN_DEG);
    const maxDeg = Math.abs(this.rotationSpeedRange?.max ?? ROT_SPEED_MAX_DEG);
    const minRad = THREE.MathUtils.degToRad(Math.min(minDeg, maxDeg));
    const maxRad = THREE.MathUtils.degToRad(Math.max(minDeg, maxDeg));
    const upper = Math.min(maxSpeed, maxRad || maxSpeed || DEFAULT_MAX_ROT_SPEED);
    const lower = Math.max(Math.min(minRad, upper), 0);
    const magnitude = THREE.MathUtils.randFloat(lower, Math.max(lower, upper, 0));
    axis.multiplyScalar(magnitude);
    this.clampRotationVector(axis, maxSpeed);
    return axis;
  }

  pickNewBaseRotationTarget(initial = false) {
    const maxSpeed = this.resolveMaxRotationSpeed();
    if (initial) {
      this.baseRotationCurrent.copy(this.randomBaseRotationVector(maxSpeed));
      this.clampRotationVector(this.baseRotationCurrent, maxSpeed);
    }

    let attempts = 0;
    do {
      this.baseRotationTarget.copy(this.randomBaseRotationVector(maxSpeed));
      attempts += 1;
    } while (
      attempts < 4 &&
      this.baseRotationTarget.distanceToSquared(this.baseRotationCurrent) < 1e-4
    );

    this.baseRotationDuration = this.randomBaseRotationDuration();
    this.baseRotationTimer = 0;
  }

  onClick() {
    return null;
  }

  updateAfterViewport() {
    if (this.viewport.width && this.viewport.height) {
      this.updateScale(this.viewport.width, this.viewport.height);
      this.positionGroup();
    }
  }

  recenterGroup({ preserveRotation }) {
    const savedQuat = preserveRotation ? this.anchor.quaternion.clone() : null;
    if (preserveRotation) {
      this.anchor.quaternion.identity();
      this.anchor.updateMatrixWorld(true);
    }

    this.group.position.set(0, 0, 0);
    this.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.group);
    const center = box.getCenter(new THREE.Vector3());
    this.group.position.sub(center);
    this.group.updateMatrixWorld(true);
    this.measure.baseOffset.copy(this.group.position);

    if (preserveRotation && savedQuat) {
      this.anchor.quaternion.copy(savedQuat);
      this.anchor.updateMatrixWorld(true);
    }
  }

  updatePointerSpeedFromDelta(dx, dy) {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    if (dx === 0 && dy === 0) return;

    const bounds = this.canvasBounds ?? this.renderer?.domElement?.getBoundingClientRect?.();
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      this.canvasBounds = bounds;
    }

    const magnitude = Math.hypot(dx, dy);
    if (magnitude === 0) return;

    const pointerScale = this.resolvePointerMultiplier();
    const scalar = (magnitude / POINTER_DISTANCE_NORMALIZER) * pointerScale * POINTER_INPUT_GAIN;
    if (!Number.isFinite(scalar) || scalar <= 0) return;

    const axis = this.randomUnitVector();
    this.pointerWorking.copy(axis).multiplyScalar(scalar);
    this.pointerWorking.add(this.pointerSpeedTarget);
    this.pointerSpeedTarget.lerp(this.pointerWorking, POINTER_TARGET_BLEND);
    this.clampRotationVector(this.pointerSpeedTarget, pointerScale * 3);

    this.inputDecayTimer = 0;
    this.requestFrame();
  }

  onPointerDown(event) {
    if (!event) return;
    this.canvasBounds = event.canvasBounds ?? this.canvasBounds;
    this.lastPointer.x = typeof event.clientX === 'number' ? event.clientX : null;
    this.lastPointer.y = typeof event.clientY === 'number' ? event.clientY : null;
    this.pointerSpeedTarget.set(0, 0, 0);
    this.pointerSpeedCurrent.set(0, 0, 0);
    this.inputDecayTimer = INPUT_DECAY_DURATION;
  }

  onPointerMove(event) {
    if (!event) return;
    this.canvasBounds = event.canvasBounds ?? this.canvasBounds;
    const currentX = typeof event.clientX === 'number' ? event.clientX : null;
    const currentY = typeof event.clientY === 'number' ? event.clientY : null;
    if (currentX === null || currentY === null) return;

    if (this.lastPointer.x === null || this.lastPointer.y === null) {
      this.lastPointer.x = currentX;
      this.lastPointer.y = currentY;
      return;
    }

    const dx = currentX - this.lastPointer.x;
    const dy = currentY - this.lastPointer.y;
    this.lastPointer.x = currentX;
    this.lastPointer.y = currentY;

    this.updatePointerSpeedFromDelta(dx, dy);
  }

  onPointerLeave() {
    this.lastPointer.x = null;
    this.lastPointer.y = null;
    this.inputDecayTimer = INPUT_DECAY_DURATION;
  }

  dispose() {
    this.scene.remove(this.anchor);
    this.anchor.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      }
    });
  }
}
