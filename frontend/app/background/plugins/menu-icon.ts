// @ts-nocheck
// Legacy background plugin relies on dynamic data; keep untyped for now.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { updateIconScale, getIconScale, calculateGroupScale } from '../../legacy/icon-scale.js';
import {
  resolveMenuObjectPixelTarget,
  resolveRuntimeSizeSnapshot,
} from '../../modules/design-system/sizeResolver';
import type { MenuSettings } from '../types';
import { createDracoGltfLoader } from './loader';

const DEFAULT_MODEL_URL = '/assets/models/menu.glb';
const MENU_RENDER_ORDER = 1000;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const MENU_ICON_COMMAND_EVENT = 'astral:menu-icon-command';

export class MenuIcon {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  requestFrame: () => void;
  relativeOffset: number;
  iconRotation: number;
  scaleMultiplier: number;
  sizeTargetMode: 'legacy-icon' | 'role-menu-object';
  modelUrl: string;
  depthOffset: number;
  anchor: THREE.Group;
  group: THREE.Group;
  parts: THREE.Mesh[];
  partTop: THREE.Mesh | null;
  partCenter: THREE.Mesh | null;
  partBottom: THREE.Mesh | null;
  viewport: { width: number; height: number };
  measure: {
    baseSize: number | null;
    lastViewWidth: number | null;
    lastViewHeight: number | null;
    lastIconPx: number | null;
    lastPixelTarget: number | null;
    flagReferencePx: number | null;
    baseOffset: THREE.Vector3;
    iconPx: number | null;
    menuObjectPx: number | null;
  };

  ready: boolean;
  camRight: THREE.Vector3;
  camUp: THREE.Vector3;
  camForward: THREE.Vector3;
  placementShift: THREE.Vector3;
  menuWorld: THREE.Vector3;
  menuScreen: THREE.Vector3;
  tmpQuat: THREE.Quaternion;
  tiltQuat: THREE.Quaternion;
  pointerState: {
    active: boolean;
    x: number;
    y: number;
    bounds: DOMRect | null;
    withinHit: boolean;
  };

  _rotationTween: symbol | null;
  partTweens: Map<THREE.Object3D, symbol>;
  _activePartTweens: number;
  tmpVecA: THREE.Vector3;
  tmpVecB: THREE.Vector3;
  baseMaterial: THREE.MeshBasicMaterial;
  loader: GLTFLoader;

  constructor({
    scene,
    camera,
    renderer,
    menuSettings = {},
    requestFrame,
  }: {
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    renderer: THREE.WebGLRenderer;
    menuSettings?: Partial<MenuSettings>;
    requestFrame?: () => void;
  }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.requestFrame = typeof requestFrame === 'function' ? requestFrame : () => {};

    const {
      relativeOffset = 1,
      iconRotation = 15,
      scaleMultiplier = 1.25,
      sizeTarget = 'role-menu-object',
      modelUrl = DEFAULT_MODEL_URL,
      depthOffset = 1,
    } = menuSettings;

    this.relativeOffset = relativeOffset;
    this.iconRotation = iconRotation;
    this.scaleMultiplier = scaleMultiplier;
    this.sizeTargetMode = sizeTarget === 'role-menu-object' ? 'role-menu-object' : 'legacy-icon';
    this.modelUrl = modelUrl;
    this.depthOffset = Number.isFinite(depthOffset) ? depthOffset : 1;

    this.anchor = new THREE.Group();
    this.anchor.renderOrder = MENU_RENDER_ORDER;
    this.scene.add(this.anchor);
    this.group = new THREE.Group();
    this.group.renderOrder = MENU_RENDER_ORDER;
    this.anchor.add(this.group);

    this.parts = [];
    this.partTop = null;
    this.partCenter = null;
    this.partBottom = null;
    this.viewport = { width: 0, height: 0 };

    this.measure = {
      baseSize: null,
      lastViewWidth: null,
      lastViewHeight: null,
      lastIconPx: null,
      lastPixelTarget: null,
      flagReferencePx: null,
      baseOffset: new THREE.Vector3(),
      iconPx: null,
      menuObjectPx: null,
    };

    this.ready = false;

    this.camRight = new THREE.Vector3();
    this.camUp = new THREE.Vector3();
    this.camForward = new THREE.Vector3();
    this.placementShift = new THREE.Vector3();
    this.menuWorld = new THREE.Vector3();
    this.menuScreen = new THREE.Vector3();
    this.tmpQuat = new THREE.Quaternion();
    this.tiltQuat = new THREE.Quaternion();
    this.pointerState = { active: false, x: 0, y: 0, bounds: null, withinHit: false };
    this._rotationTween = null;
    this.partTweens = new Map();
    this._activePartTweens = 0;
    this.tmpVecA = new THREE.Vector3();
    this.tmpVecB = new THREE.Vector3();

    this.baseMaterial = new THREE.MeshBasicMaterial({
      color: 0xE9E6E0,
      side: THREE.FrontSide,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      depthTest: false,
    });

    this.loader = createDracoGltfLoader();

    this.onMenuCommand = this.onMenuCommand.bind(this);
  }

  async init() {
    try {
      await this.loadModel();
    } catch {
      this.fallback();
    }
    this.ready = true;
    this.updateAfterViewport();
    if (typeof window !== 'undefined') {
      window.addEventListener(MENU_ICON_COMMAND_EVENT, this.onMenuCommand);
    }
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
              mesh.renderOrder = MENU_RENDER_ORDER;
              if (mesh.material) {
                mesh.material.transparent = true;
                mesh.material.opacity = 1;
                mesh.material.depthWrite = false;
                mesh.material.depthTest = false;
              }
              this.parts.push(mesh);
              this.group.add(mesh);
            } else if (o.isInstancedMesh && o.geometry) {
              const baseGeometry = o.geometry.clone();
              if (!baseGeometry.attributes.normal) baseGeometry.computeVertexNormals();
              const MW = new THREE.Matrix4();
              for (let i = 0; i < o.count; i++) {
                o.getMatrixAt(i, MW);
                const world = o.matrixWorld.clone().multiply(MW);
                world.decompose(P, Q, S);
                const mesh = new THREE.Mesh(baseGeometry.clone(), this.baseMaterial.clone());
                mesh.position.copy(P);
                mesh.quaternion.copy(Q);
                mesh.scale.copy(S);
                mesh.updateMatrixWorld(true);
                mesh.renderOrder = MENU_RENDER_ORDER;
                if (mesh.material) {
                  mesh.material.transparent = true;
                  mesh.material.opacity = 1;
                  mesh.material.depthWrite = false;
                  mesh.material.depthTest = false;
                }
                this.parts.push(mesh);
                this.group.add(mesh);
              }
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
    const geometry = new THREE.CapsuleGeometry(0.5, 1.5, 4, 12);
    const meshes = [
      new THREE.Mesh(geometry, this.baseMaterial.clone()),
      new THREE.Mesh(geometry.clone(), this.baseMaterial.clone()),
      new THREE.Mesh(geometry.clone(), this.baseMaterial.clone()),
    ];
    meshes[0].position.set(0, 1.6, 0);
    meshes[1].position.set(0, 0, 0);
    meshes[2].position.set(0, -1.6, 0);
    meshes.forEach((mesh) => {
      this.parts.push(mesh);
      mesh.renderOrder = MENU_RENDER_ORDER;
      if (mesh.material) {
        mesh.material.transparent = true;
        mesh.material.opacity = 1;
        mesh.material.depthWrite = false;
        mesh.material.depthTest = false;
      }
      this.group.add(mesh);
    });
    this.prepareGroup();
  }

  prepareGroup() {
    if (this.parts.length === 0) return;
    this.anchor.position.set(0, 0, 0);
    this.anchor.quaternion.identity();
    this.group.position.set(0, 0, 0);
    this.group.scale.setScalar(1);
    this.group.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(this.group);
    const center = box.getCenter(new THREE.Vector3());
    this.group.position.sub(center);
    this.group.updateMatrixWorld(true);
    this.measure.baseOffset.copy(this.group.position);

    const alignedBox = new THREE.Box3().setFromObject(this.group);
    const size = alignedBox.getSize(new THREE.Vector3());
    const largestExtent = Math.max(size.x, size.y, size.z);
    this.measure.baseSize = largestExtent || 1;
    this.measure.lastViewWidth = null;
    this.measure.lastViewHeight = null;
    this.assignPartsByY();
  }

  assignPartsByY() {
    if (!this.parts.length) {
      this.partTop = null;
      this.partCenter = null;
      this.partBottom = null;
      return;
    }

    const candidates = this.parts.slice();
    const vecA = this.tmpVecA;
    const vecB = this.tmpVecB;

    candidates.sort((a, b) => {
      if (!a && !b) return 0;
      if (!a) return 1;
      if (!b) return -1;
      a.updateMatrixWorld(true);
      b.updateMatrixWorld(true);
      a.getWorldPosition(vecA);
      b.getWorldPosition(vecB);
      return vecB.y - vecA.y;
    });

    const lastIndex = candidates.length - 1;
    this.partTop = candidates[0] ?? null;
    this.partBottom = lastIndex >= 0 ? candidates[lastIndex] : null;
    const midIndex = Math.floor(candidates.length / 2);
    this.partCenter = candidates[midIndex] ?? this.partBottom ?? this.partTop ?? null;
  }

  onResize(viewW, viewH) {
    this.viewport.width = viewW;
    this.viewport.height = viewH;
    const iconPx = updateIconScale(viewW, viewH);
    if (Number.isFinite(iconPx)) this.measure.iconPx = iconPx;
    this.updateScale(viewW, viewH, this.measure.iconPx);
    this.positionGroup(viewW, viewH, this.measure.iconPx);
  }

  onCameraMove() {
    if (!this.viewport.width || !this.viewport.height) return;
    this.positionGroup(this.viewport.width, this.viewport.height, this.measure.iconPx);
  }

  updateScale(viewW, viewH, iconPx) {
    const sameDimensions =
      viewW === this.measure.lastViewWidth && viewH === this.measure.lastViewHeight;
    const snapshot = resolveRuntimeSizeSnapshot(
      Number.isFinite(iconPx) ? iconPx : this.measure.iconPx,
    );
    const pixelTarget = resolveMenuObjectPixelTarget(snapshot, this.sizeTargetMode);
    const pixelTargetUnchanged =
      Number.isFinite(pixelTarget) && pixelTarget === this.measure.lastPixelTarget;
    if (sameDimensions && pixelTargetUnchanged) return;
    const scale = calculateGroupScale({
      viewWidth: viewW,
      viewHeight: viewH,
      iconPx: snapshot.iconPx,
      pixelSize: pixelTarget,
      viewportHeight: this.viewport.height,
      cameraTop: this.camera.top,
      cameraBottom: this.camera.bottom,
      baseSize: this.measure.baseSize,
    });
    if (!scale) return;
    this.measure.lastViewWidth = viewW;
    this.measure.lastViewHeight = viewH;
    this.measure.lastIconPx = snapshot.iconPx;
    this.measure.lastPixelTarget = pixelTarget;
    this.measure.iconPx = snapshot.iconPx;
    this.measure.menuObjectPx = snapshot.menuObjectPx;
    this.measure.flagReferencePx = snapshot.flagReferencePx;
    this.group.scale.setScalar(scale * this.scaleMultiplier);
    this.group.updateMatrixWorld(true);
  }

  positionGroup(viewW, viewH, iconPxOverride) {
    if (!this.measure.baseSize || viewW <= 0 || viewH <= 0) return;

    const halfViewportW = viewW / 2;
    const halfViewportH = viewH / 2;
    if (!halfViewportW || !halfViewportH) return;

    const iconPx = Number.isFinite(iconPxOverride)
      ? iconPxOverride
      : Number.isFinite(this.measure.iconPx)
        ? this.measure.iconPx
        : getIconScale();
    if (!Number.isFinite(iconPx) || iconPx <= 0) return;
    this.measure.iconPx = iconPx;
    const cornerDistancePx = this.resolveCornerDistancePx(iconPx);
    if (!Number.isFinite(cornerDistancePx) || cornerDistancePx <= 0) return;

    const shiftPxX = Math.max(0, halfViewportW - cornerDistancePx);
    const shiftPxY = Math.max(0, halfViewportH - cornerDistancePx);

    const unitsPerPixelX = (this.camera.right - this.camera.left) / viewW;
    const unitsPerPixelY = (this.camera.top - this.camera.bottom) / viewH;

    const shiftWorldX = shiftPxX * unitsPerPixelX;
    const shiftWorldY = shiftPxY * unitsPerPixelY;

    this.camera.updateMatrixWorld(true);
    this.camera.matrixWorld.extractBasis(this.camRight, this.camUp, this.camForward);
    this.camRight.normalize();
    this.camUp.normalize();
    this.camForward.normalize();

    this.placementShift.copy(this.camRight).multiplyScalar(shiftWorldX);
    this.placementShift.addScaledVector(this.camUp, shiftWorldY);

    this.group.position.copy(this.measure.baseOffset);
    this.group.updateMatrixWorld(true);

    this.anchor.position.copy(this.placementShift);
    const cameraDistance = this.camera.position.length();
    const margin = Math.max(this.camera.near * 2, Math.abs(this.depthOffset));
    const maxDistance = cameraDistance - this.camera.near * 1.1;
    const upperBound = Math.max(this.camera.near, maxDistance);
    const forwardDistance = THREE.MathUtils.clamp(
      cameraDistance - margin,
      this.camera.near,
      upperBound,
    );
    this.anchor.position.addScaledVector(this.camForward, forwardDistance);
    this.anchor.updateMatrixWorld(true);
    this.applyPointerRotation();
  }

  isPointerWithinHit(clientX, clientY, bounds) {
    if (!this.ready) return false;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
    if (!this.viewport.width || !this.viewport.height) return false;

    let rect = bounds;
    if (!rect || !rect.width || !rect.height) {
      rect = this.renderer?.domElement?.getBoundingClientRect?.();
    }

    if (!rect || rect.width === 0 || rect.height === 0) return false;

    const px = (clientX - rect.left) * (this.viewport.width / rect.width);
    const py = (clientY - rect.top) * (this.viewport.height / rect.height);

    const radius =
      Number.isFinite(this.measure.lastPixelTarget)
        ? this.measure.lastPixelTarget
        : Number.isFinite(this.measure.iconPx)
          ? this.measure.iconPx
          : getIconScale();
    if (!Number.isFinite(radius) || radius <= 0) return false;

    const halfViewportW = this.viewport.width / 2;
    const halfViewportH = this.viewport.height / 2;
    // Keep hit-center alignment in sync with positionGroup().
    const cornerDistancePx = this.resolveCornerDistancePx();
    if (!Number.isFinite(cornerDistancePx) || cornerDistancePx <= 0) return false;
    const shiftPxX = Math.max(0, halfViewportW - cornerDistancePx);
    const shiftPxY = Math.max(0, halfViewportH - cornerDistancePx);
    // Screen-space center of the menu icon (mirrors placement logic).
    const menuPx = halfViewportW + shiftPxX;
    const menuPy = halfViewportH - shiftPxY;

    const dx = px - menuPx;
    const dy = py - menuPy;

    return dx * dx + dy * dy <= radius * radius;
  }

  applyPointerRotation() {
    if (!this.ready) return;
    this.requestFrame();
    if (!this.pointerState.active) {
      this.anchor.quaternion.identity();
      this.anchor.updateMatrixWorld(true);
      return;
    }

    if (!this.viewport.width || !this.viewport.height) return;

    let bounds = this.pointerState.bounds;
    if (!bounds || !bounds.width || !bounds.height) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      bounds = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    }

    this.pointerState.bounds = bounds;

    const px = (this.pointerState.x - bounds.left) * (this.viewport.width / bounds.width);
    const py = (this.pointerState.y - bounds.top) * (this.viewport.height / bounds.height);

    this.anchor.getWorldPosition(this.menuWorld);
    this.menuScreen.copy(this.menuWorld).project(this.camera);
    const menuPx = ((this.menuScreen.x + 1) / 2) * this.viewport.width;
    const menuPy = ((-this.menuScreen.y + 1) / 2) * this.viewport.height;

    const dx = px - menuPx;
    const dy = py - menuPy;

    const cornerDistancePx = this.resolveCornerDistancePx();
    const effectiveCornerDistance =
      Number.isFinite(cornerDistancePx) && cornerDistancePx > 0 ? cornerDistancePx : 0;
    const range = Math.max(
      1,
      Math.max(this.viewport.width, this.viewport.height) - effectiveCornerDistance * 2,
    );

    const normX = THREE.MathUtils.clamp(dx / range, -1, 1);
    const normY = THREE.MathUtils.clamp(dy / range, -1, 1);
    const rotRad = THREE.MathUtils.degToRad(this.iconRotation);

    this.camera.matrixWorld.extractBasis(this.camRight, this.camUp, this.camForward);
    this.camRight.normalize();
    this.camUp.normalize();
    this.camForward.normalize();

    this.tiltQuat.identity();
    this.tiltQuat.setFromAxisAngle(this.camRight, rotRad * normY);
    this.tmpQuat.setFromAxisAngle(this.camUp, -rotRad * normX);
    this.tiltQuat.premultiply(this.tmpQuat);

    this.anchor.quaternion.copy(this.tiltQuat);
    this.anchor.updateMatrixWorld(true);
  }

  onClick(event) {
    if (!this.ready) return null;

    const clientX = Number.isFinite(event?.clientX) ? event.clientX : this.pointerState.x;
    const clientY = Number.isFinite(event?.clientY) ? event.clientY : this.pointerState.y;
    const bounds = event?.canvasBounds ?? this.pointerState.bounds;

    // Re-evaluate against the circular menu click area using the latest pointer data.
    const withinHit = this.isPointerWithinHit(clientX, clientY, bounds);
    this.pointerState.withinHit = withinHit;

    if (!withinHit) return null;

    if (Number.isFinite(clientX)) this.pointerState.x = clientX;
    if (Number.isFinite(clientY)) this.pointerState.y = clientY;
    if (event?.canvasBounds) this.pointerState.bounds = event.canvasBounds;

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(
        new CustomEvent('astral:menu-toggle', {
          detail: {
            source: 'menu-icon',
            action: 'toggle',
          },
        }),
      );
    }

    const result = this.triggerToggleAnimation();
    const groupSign = result.group;
    return `menu group ${groupSign > 0 ? '+90°' : '-90°'}`;
  }

  tweenGroupRotation(radians) {
    this.requestFrame();
    const startQuat = this.group.quaternion.clone();
    this.tmpQuat.setFromAxisAngle(X_AXIS, radians);
    const targetQuat = startQuat.clone().multiply(this.tmpQuat);
    const start = performance.now();
    const duration = 600;
    const tweenToken = Symbol('menuGroupRotation');
    this._rotationTween = tweenToken;

    const step = () => {
      if (this._rotationTween !== tweenToken) return;
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / duration);
      this.group.quaternion.slerpQuaternions(startQuat, targetQuat, t);
      this.group.updateMatrixWorld(true);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        this._rotationTween = null;
      }
    };

    step();
  }

  tweenPartRotation(mesh, radians) {
    if (!mesh || !Number.isFinite(radians) || radians === 0) return;

    const startQuat = mesh.quaternion.clone();
    this.tmpQuat.setFromAxisAngle(X_AXIS, radians);
    const targetQuat = startQuat.clone().multiply(this.tmpQuat);
    const start = performance.now();
    const duration = 350;
    const tweenToken = Symbol('menuPartRotation');

    this.partTweens.set(mesh, tweenToken);
    this._activePartTweens = this.partTweens.size;

    const step = () => {
      if (this.partTweens.get(mesh) !== tweenToken) return;
      const elapsed = performance.now() - start;
      const t = Math.min(1, elapsed / duration);
      mesh.quaternion.slerpQuaternions(startQuat, targetQuat, t);
      mesh.updateMatrixWorld(true);
      this.requestFrame();
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        this.partTweens.delete(mesh);
        this._activePartTweens = this.partTweens.size;
      }
    };

    this.requestFrame();
    step();
  }

  triggerToggleAnimation({ direction, partDirections } = {}) {
    if (!this.ready) return { group: 0, parts: {} };

    const resolveSign = (value) => {
      if (value === 'positive' || value === 1) return 1;
      if (value === 'negative' || value === -1) return -1;
      return Math.random() < 0.5 ? -1 : 1;
    };

    const groupSign = resolveSign(direction);
    const radians = (groupSign * Math.PI) / 2;
    this.tweenGroupRotation(radians);

    const parts = {};
    if (this.partTop) {
      const sign = resolveSign(partDirections?.top);
      this.tweenPartRotation(this.partTop, (sign * Math.PI) / 2);
      parts.top = sign;
    }
    if (this.partCenter) {
      const sign = resolveSign(partDirections?.center);
      this.tweenPartRotation(this.partCenter, (sign * Math.PI) / 2);
      parts.center = sign;
    }
    if (this.partBottom) {
      const sign = resolveSign(partDirections?.bottom);
      this.tweenPartRotation(this.partBottom, (sign * Math.PI) / 2);
      parts.bottom = sign;
    }

    return { group: groupSign, parts };
  }

  onMenuCommand(event) {
    if (!this.ready) return;
    const detail = event?.detail;
    if (!detail || detail.source === 'menu-icon') return;
    const action = detail.action;
    if (action !== 'close' && action !== 'toggle' && action !== 'open') return;
    this.triggerToggleAnimation({ direction: detail.direction });
  }

  wantsFrame() {
    return this._rotationTween !== null || this._activePartTweens > 0;
  }

  updateAfterViewport() {
    if (this.viewport.width && this.viewport.height) {
      const iconPx = Number.isFinite(this.measure.iconPx) ? this.measure.iconPx : getIconScale();
      this.updateScale(this.viewport.width, this.viewport.height, iconPx);
      this.positionGroup(this.viewport.width, this.viewport.height, iconPx);
    }
  }

  resolveCornerDistancePx(iconPxOverride) {
    const iconPx = Number.isFinite(iconPxOverride)
      ? iconPxOverride
      : Number.isFinite(this.measure.iconPx)
        ? this.measure.iconPx
        : getIconScale();
    if (!Number.isFinite(iconPx) || iconPx <= 0) return null;

    const offsetMultiplier =
      Number.isFinite(this.relativeOffset) && this.relativeOffset > 0 ? this.relativeOffset : 1;

    const flagReferencePx = Number.isFinite(this.measure.flagReferencePx)
      ? this.measure.flagReferencePx
      : null;
    if (this.sizeTargetMode === 'role-menu-object' && Number.isFinite(flagReferencePx) && flagReferencePx > 0) {
      return flagReferencePx * offsetMultiplier;
    }

    const menuObjectPx = Number.isFinite(this.measure.menuObjectPx)
      ? this.measure.menuObjectPx
      : Number.isFinite(this.measure.lastPixelTarget)
        ? this.measure.lastPixelTarget
        : iconPx;
    const baseDistance = this.sizeTargetMode === 'role-menu-object' ? menuObjectPx : iconPx;
    if (!Number.isFinite(baseDistance) || baseDistance <= 0) return null;

    return baseDistance * offsetMultiplier;
  }

  updatePointerFromEvent(event) {
    const pointerType = event?.pointerType || 'mouse';
    const allowFreeUpdate =
      pointerType === 'mouse' || pointerType === 'pen' || pointerType === 'unknown';

    const clientX = Number.isFinite(event?.clientX) ? event.clientX : this.pointerState.x;
    const clientY = Number.isFinite(event?.clientY) ? event.clientY : this.pointerState.y;

    let bounds = event?.canvasBounds ?? this.pointerState.bounds;
    if (!bounds || !bounds.width || !bounds.height) {
      const rect = this.renderer?.domElement?.getBoundingClientRect?.();
      if (rect?.width && rect?.height) bounds = rect;
    }

    if (!Number.isFinite(clientX) || !Number.isFinite(clientY) || !bounds) {
      this.pointerState.withinHit = false;
      return false;
    }

    const withinHit = this.isPointerWithinHit(clientX, clientY, bounds);

    if (allowFreeUpdate || withinHit) {
      this.pointerState.x = clientX;
      this.pointerState.y = clientY;
      this.pointerState.bounds = bounds;
    }

    this.pointerState.withinHit = withinHit;
    return withinHit;
  }

  onPointerDown(event) {
    const pointerType = event?.pointerType || 'mouse';
    const allowFreeUpdate =
      pointerType === 'mouse' || pointerType === 'pen' || pointerType === 'unknown';
    const withinHit = this.updatePointerFromEvent(event);
    this.pointerState.active = allowFreeUpdate || withinHit;
    if (!this.pointerState.active) return;
    this.applyPointerRotation();
  }

  onPointerMove(event) {
    const pointerType = event?.pointerType || 'mouse';
    const allowFreeUpdate =
      pointerType === 'mouse' || pointerType === 'pen' || pointerType === 'unknown';
    const withinHit = this.updatePointerFromEvent(event);

    if (allowFreeUpdate) {
      this.pointerState.active = true;
      this.applyPointerRotation();
      return;
    }

    if (this.pointerState.active) {
      if (!withinHit) {
        this.pointerState.active = false;
        this.applyPointerRotation();
        return;
      }
      this.applyPointerRotation();
      return;
    }

    if (withinHit) {
      this.pointerState.active = true;
      this.applyPointerRotation();
    }
  }

  onPointerLeave() {
    if (!this.pointerState.active) return;
    this.pointerState.active = false;
    this.pointerState.bounds = null;
    this.pointerState.withinHit = false;
    this.applyPointerRotation();
  }

  dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener(MENU_ICON_COMMAND_EVENT, this.onMenuCommand);
    }
    this.partTweens.clear();
    this._activePartTweens = 0;
    this.scene.remove(this.anchor);
    this.anchor.traverse((obj) => {
      if (obj.isMesh) {
        obj.geometry?.dispose?.();
        obj.material?.dispose?.();
      }
    });
  }
}
