// @ts-nocheck
// Legacy background plugin relies on dynamic data; keep untyped for now.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { isEmbeddableModelUrl } from '@astralpirates/shared/galleryMedia';
import { DEFAULT_FLAG_SETTINGS, DEFAULT_FLAG_TEXTURE_URL } from '../settings';
import type { FlagSettings } from '../types';
import { normalizeAvatarUrl } from '~/modules/media/avatarUrls';
import { normalizeAvatarMediaRecord } from '~/modules/media/avatarMedia';
import {
  isAvatarTriModeEnabled,
  isFlagModelReplacementEnabled,
} from '~/modules/featureFlags/avatarTriMode';
import { resolveAstralApiBase } from '~/modules/api/requestFetch';
import { createDracoGltfLoader } from './loader';

const DEFAULT_TEXTURE_URL = DEFAULT_FLAG_TEXTURE_URL;
const DEFAULT_CENTER_HIT_RADIUS = 0.25;
const DEFAULT_HOME_URL = '/';
const SESSION_STORAGE_KEY = 'astralpirates-session';
const FLAG_RENDER_ORDER = 1000;
const PROFILE_ENDPOINT_PREFIX = '/api/profiles/';

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const resolveProfileEndpointPrefix = (): string => {
  const apiBase = resolveAstralApiBase();
  if (!apiBase || isAbsoluteUrl(apiBase)) return PROFILE_ENDPOINT_PREFIX;
  const normalizedBase = apiBase.replace(/\/+$/, '');
  if (!normalizedBase || normalizedBase === '/') return PROFILE_ENDPOINT_PREFIX;
  return `${normalizedBase}${PROFILE_ENDPOINT_PREFIX}`.replace(/\/{2,}/g, '/');
};

const safeTrimmedString = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length ? trimmed : '';
};

const parseEpochSeconds = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
};

const resolveSessionExpirySeconds = (session: any): number | null => {
  const expSeconds = parseEpochSeconds(session?.exp);
  if (expSeconds) return expSeconds;

  const expiresAtRaw = safeTrimmedString(session?.expiresAt);
  if (!expiresAtRaw) return null;
  const timestamp = Date.parse(expiresAtRaw);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return Math.floor(timestamp / 1000);
};

const isExpiredSession = (session: any): boolean => {
  const expirySeconds = resolveSessionExpirySeconds(session);
  if (!expirySeconds) return false;
  return expirySeconds <= Math.floor(Date.now() / 1000);
};

const readSession = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (isExpiredSession(parsed)) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const sanitizePositiveNumber = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

const ALIGN_LEFT = 'left';
const ALIGN_RIGHT = 'right';
const ALIGN_TOP = 'top';
const ALIGN_BOTTOM = 'bottom';

export class FlagPlugin {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  requestFrame: () => void;
  textureUrl: string;
  defaultTextureUrl: string;
  currentTextureUrl: string;
  resolvedDefaultTextureUrl: string;
  flagWidth: number | null;
  flagHeight: number | null;
  initialWidth: number;
  initialHeight: number;
  unscaledWidth: number;
  unscaledHeight: number;
  segmentsW: number;
  segmentsH: number;
  reduceMotion: boolean;
  waveAmplitude: number;
  waveFrequency: number;
  waveSpeed: number;
  verticalRipple: number;
  marginPx: number;
  offsetPx: { x: number; y: number };
  anchorHorizontal: string;
  anchorVertical: string;
  depthOffset: number;
  preserveAspect: boolean;
  scaleMultiplier: number;
  centerHitRadius: number;
  centerHitRadiusSq: number;
  homeUrl: string;
  defaultHomeUrl: string;
  sessionProfileSlug: string | null;
  alwaysAnimate: boolean;
  anchor: THREE.Group;
  group: THREE.Group;
  viewport: { width: number; height: number };
  groupOffsetX: number;
  groupOffsetY: number;
  flagMesh: THREE.Mesh | null;
  flagHitMesh: THREE.Mesh | null;
  flagGeometry: THREE.PlaneGeometry | null;
  flagBasePositions: Float32Array | null;
  flagNormalsCountdown: number;
  time: number;
  ready: boolean;
  camRight: THREE.Vector3;
  camUp: THREE.Vector3;
  camForward: THREE.Vector3;
  placementShift: THREE.Vector3;
  pointerNdc: THREE.Vector2;
  raycaster: THREE.Raycaster;
  avatarCache: Map<string, ReturnType<typeof normalizeAvatarMediaRecord>>;
  avatarFetchController: AbortController | null;
  avatarFetchSlug: string | null;
  avatarMode: 'image' | 'video' | 'model';
  avatarVideoElement: HTMLVideoElement | null;
  avatarVideoTexture: THREE.VideoTexture | null;
  avatarModelRoot: THREE.Object3D | null;
  avatarModelLoader: GLTFLoader | null;
  avatarMediaNonce: number;
  triModeEnabled: boolean;
  modelReplacementEnabled: boolean;
  currentSession: any;

  constructor({
    scene,
    camera,
    renderer,
    requestFrame,
    flagSettings = {},
  }: {
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    renderer: THREE.WebGLRenderer;
    requestFrame?: () => void;
    flagSettings?: Partial<FlagSettings>;
  }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.requestFrame = typeof requestFrame === 'function' ? requestFrame : () => {};

    const {
      textureUrl = DEFAULT_FLAG_SETTINGS.textureUrl ?? DEFAULT_TEXTURE_URL,
      width = DEFAULT_FLAG_SETTINGS.width,
      height = DEFAULT_FLAG_SETTINGS.height,
      scale = DEFAULT_FLAG_SETTINGS.scale,
      segmentsW = DEFAULT_FLAG_SETTINGS.segmentsW,
      segmentsH = DEFAULT_FLAG_SETTINGS.segmentsH,
      waveAmplitude = DEFAULT_FLAG_SETTINGS.waveAmplitude,
      waveFrequency = DEFAULT_FLAG_SETTINGS.waveFrequency,
      waveSpeed = DEFAULT_FLAG_SETTINGS.waveSpeed,
      verticalRipple = DEFAULT_FLAG_SETTINGS.verticalRipple,
      marginPx = DEFAULT_FLAG_SETTINGS.marginPx,
      offsetPx = DEFAULT_FLAG_SETTINGS.offsetPx,
      anchorHorizontal = DEFAULT_FLAG_SETTINGS.anchorHorizontal ?? ALIGN_LEFT,
      anchorVertical = DEFAULT_FLAG_SETTINGS.anchorVertical ?? ALIGN_TOP,
      depthOffset = DEFAULT_FLAG_SETTINGS.depthOffset,
      preserveAspect = DEFAULT_FLAG_SETTINGS.preserveAspect,
      centerHitRadius = DEFAULT_FLAG_SETTINGS.centerHitRadius ?? DEFAULT_CENTER_HIT_RADIUS,
      homeUrl = DEFAULT_FLAG_SETTINGS.homeUrl ?? DEFAULT_HOME_URL,
      reduceMotion = DEFAULT_FLAG_SETTINGS.reduceMotion,
    } = flagSettings;

    const resolvedDefaultUrl = this.resolveTextureUrl(textureUrl) || textureUrl;
    this.textureUrl = resolvedDefaultUrl;
    this.defaultTextureUrl = resolvedDefaultUrl;
    this.currentTextureUrl = resolvedDefaultUrl;
    this.resolvedDefaultTextureUrl = resolvedDefaultUrl;
    const widthSeed = sanitizePositiveNumber(width);
    const heightSeed = sanitizePositiveNumber(height);
    const fallbackWidth = widthSeed ?? heightSeed ?? 1.6;
    const fallbackHeight = heightSeed ?? widthSeed ?? 1.6;

    this.flagWidth = widthSeed;
    this.flagHeight = heightSeed;
    this.initialWidth = fallbackWidth;
    this.initialHeight = fallbackHeight;
    this.unscaledWidth = this.initialWidth;
    this.unscaledHeight = this.initialHeight;

    const segW = Math.floor(Number(segmentsW));
    const segH = Math.floor(Number(segmentsH));
    this.segmentsW = Math.max(2, Number.isFinite(segW) ? segW : 32);
    this.segmentsH = Math.max(2, Number.isFinite(segH) ? segH : 18);
    this.reduceMotion = reduceMotion === true;
    this.waveAmplitude = this.reduceMotion ? 0 : waveAmplitude;
    this.waveFrequency = waveFrequency;
    this.waveSpeed = this.reduceMotion ? 0 : waveSpeed;
    this.verticalRipple = verticalRipple;
    this.marginPx = marginPx;
    this.offsetPx = {
      x: Number.isFinite(offsetPx?.x) ? offsetPx.x : 0,
      y: Number.isFinite(offsetPx?.y) ? offsetPx.y : 0,
    };
    this.anchorHorizontal = anchorHorizontal === ALIGN_RIGHT ? ALIGN_RIGHT : ALIGN_LEFT;
    this.anchorVertical = anchorVertical === ALIGN_BOTTOM ? ALIGN_BOTTOM : ALIGN_TOP;
    this.depthOffset = Number.isFinite(depthOffset) ? depthOffset : 0.8;
    this.preserveAspect = preserveAspect !== false;
    this.scaleMultiplier = sanitizePositiveNumber(scale) ?? 1;
    const radius = Number.isFinite(centerHitRadius)
      ? Math.max(0, centerHitRadius)
      : DEFAULT_CENTER_HIT_RADIUS;
    this.centerHitRadius = radius;
    this.centerHitRadiusSq = radius * radius;
    this.homeUrl =
      typeof homeUrl === 'string' && homeUrl.trim().length > 0 ? homeUrl : DEFAULT_HOME_URL;
    this.defaultHomeUrl = this.homeUrl;
    this.sessionProfileSlug = null;
    this.alwaysAnimate = !this.reduceMotion;

    this.anchor = new THREE.Group();
    this.anchor.renderOrder = FLAG_RENDER_ORDER;
    this.scene.add(this.anchor);

    this.group = new THREE.Group();
    this.group.renderOrder = FLAG_RENDER_ORDER;
    this.anchor.add(this.group);

    this.viewport = { width: 0, height: 0 };

    this.groupOffsetX = this.unscaledWidth / 2;
    this.groupOffsetY = -this.unscaledHeight / 2;

    this.flagMesh = null;
    this.flagHitMesh = null;
    this.flagGeometry = null;
    this.flagBasePositions = null;
    this.flagNormalsCountdown = 0;

    this.time = 0;
    this.ready = false;

    this.camRight = new THREE.Vector3();
    this.camUp = new THREE.Vector3();
    this.camForward = new THREE.Vector3();
    this.placementShift = new THREE.Vector3();
    this.pointerNdc = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();

    this.onStorage = this.onStorage.bind(this);
    this.onSessionEvent = this.onSessionEvent.bind(this);
    this.avatarCache = new Map();
    this.avatarFetchController = null;
    this.avatarFetchSlug = null;
    this.avatarMode = 'image';
    this.avatarVideoElement = null;
    this.avatarVideoTexture = null;
    this.avatarModelRoot = null;
    this.avatarModelLoader = null;
    this.avatarMediaNonce = 0;
    this.triModeEnabled = isAvatarTriModeEnabled();
    this.modelReplacementEnabled = isFlagModelReplacementEnabled();
    this.currentSession = null;

    this.syncSessionState();

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', this.onStorage);
      window.addEventListener('astral:session-changed', this.onSessionEvent);
    }
  }

  async init() {
    const defaultUrl = this.getResolvedDefaultTextureUrl();
    try {
      const texture = await this.loadTexture(this.textureUrl);
      this.buildFlag(texture);
      this.ready = true;
      this.updateAfterViewport();
      this.syncSessionState(this.currentSession);
      this.requestFrame();
    } catch {
      if (!defaultUrl || this.textureUrl === defaultUrl) return;
      try {
        const fallbackTexture = await this.loadTexture(defaultUrl);
        this.textureUrl = defaultUrl;
        this.currentTextureUrl = defaultUrl;
        this.buildFlag(fallbackTexture);
        this.ready = true;
        this.updateAfterViewport();
        this.syncSessionState(this.currentSession);
        this.requestFrame();
      } catch {
        // no-op
      }
    }
  }

  loadTexture(url) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      const crossOrigin = this.resolveCrossOriginMode(url);
      if (crossOrigin) {
        loader.setCrossOrigin(crossOrigin);
      }
      loader.load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          if (this.renderer?.capabilities?.getMaxAnisotropy) {
            texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
          }
          resolve(texture);
        },
        undefined,
        (err) => reject(err),
      );
    });
  }

  buildFlag(texture) {
    const resolved = this.resolveDimensions(texture);

    this.unscaledWidth = resolved.width;
    this.unscaledHeight = resolved.height;
    this.groupOffsetX = this.unscaledWidth / 2;
    this.groupOffsetY = -this.unscaledHeight / 2;

    const geometry = new THREE.PlaneGeometry(
      resolved.width,
      resolved.height,
      this.segmentsW,
      this.segmentsH,
    );

    if (this.scaleMultiplier !== 1) {
      geometry.scale(this.scaleMultiplier, this.scaleMultiplier, 1);
    }

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      metalness: 0.1,
      roughness: 0.6,
      emissive: 0x000000,
      depthWrite: false,
      depthTest: false,
    });

    const scaledWidth = this.unscaledWidth * this.scaleMultiplier;
    const scaledHeight = this.unscaledHeight * this.scaleMultiplier;

    this.flagGeometry = geometry;
    this.flagWidth = scaledWidth;
    this.flagHeight = scaledHeight;

    this.flagMesh = new THREE.Mesh(geometry, material);
    this.flagMesh.renderOrder = FLAG_RENDER_ORDER;
    this.flagMesh.position.set(0, 0, 0);
    this.group.add(this.flagMesh);

    if (this.flagHitMesh) {
      this.group.remove(this.flagHitMesh);
      this.flagHitMesh.geometry?.dispose?.();
      this.flagHitMesh.material?.dispose?.();
    }
    const hitGeometry = new THREE.PlaneGeometry(resolved.width, resolved.height, 1, 1);
    if (this.scaleMultiplier !== 1) {
      hitGeometry.scale(this.scaleMultiplier, this.scaleMultiplier, 1);
    }
    const hitMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.flagHitMesh = new THREE.Mesh(hitGeometry, hitMaterial);
    this.flagHitMesh.renderOrder = FLAG_RENDER_ORDER + 1;
    this.flagHitMesh.position.set(0, 0, 0);
    this.group.add(this.flagHitMesh);

    this.group.position.set(this.groupOffsetX, this.groupOffsetY, 0);

    this.flagBasePositions = geometry.attributes.position.array.slice();
    this.flagNormalsCountdown = 0;
  }

  setFlagMeshVisibility(visible) {
    if (this.flagMesh) {
      this.flagMesh.visible = visible;
    }
    if (this.flagHitMesh) {
      this.flagHitMesh.visible = true;
    }
  }

  disposeObjectResources(node) {
    if (!node) return;
    node.traverse?.((candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      if (candidate.geometry?.dispose) {
        candidate.geometry.dispose();
      }
      const material = candidate.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => {
          if (!entry) return;
          if (entry.map?.dispose) entry.map.dispose();
          if (entry.dispose) entry.dispose();
        });
      } else if (material) {
        if (material.map?.dispose) material.map.dispose();
        if (material.dispose) material.dispose();
      }
    });
  }

  clearAvatarModelResources() {
    if (!this.avatarModelRoot) return;
    this.group.remove(this.avatarModelRoot);
    this.disposeObjectResources(this.avatarModelRoot);
    this.avatarModelRoot = null;
  }

  clearAvatarVideoResources() {
    const material = this.flagMesh?.material ?? null;
    if (material?.map && this.avatarVideoTexture && material.map === this.avatarVideoTexture) {
      material.map = null;
      material.needsUpdate = true;
    }
    if (this.avatarVideoTexture) {
      this.avatarVideoTexture.dispose();
      this.avatarVideoTexture = null;
    }
    if (this.avatarVideoElement) {
      try {
        this.avatarVideoElement.pause();
      } catch {
        // no-op
      }
      this.avatarVideoElement.removeAttribute('src');
      this.avatarVideoElement.load?.();
      this.avatarVideoElement = null;
    }
  }

  resolveAvatarMedia(candidate) {
    const input =
      typeof candidate === 'string'
        ? { avatarUrl: candidate }
        : candidate && typeof candidate === 'object'
          ? candidate
          : {};

    const normalized = normalizeAvatarMediaRecord({
      avatarUrl: input.avatarUrl ?? null,
      avatarMediaType: input.avatarMediaType,
      avatarMediaUrl: input.avatarMediaUrl ?? null,
      avatarMimeType: input.avatarMimeType ?? null,
      avatarFilename: input.avatarFilename ?? null,
    });

    if (!this.triModeEnabled) {
      const fallbackUrl =
        normalized.avatarMediaType === 'image'
          ? normalized.avatarUrl ?? normalized.avatarMediaUrl
          : null;
      return {
        ...normalized,
        avatarMediaType: 'image',
        avatarMediaUrl: fallbackUrl,
      };
    }

    return normalized;
  }

  loadAvatarVideoTexture(url) {
    return new Promise((resolve, reject) => {
      if (typeof document === 'undefined') {
        reject(new Error('video unavailable'));
        return;
      }

      const video = document.createElement('video');
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.autoplay = true;
      video.preload = 'auto';

      const crossOrigin = this.resolveCrossOriginMode(url);
      if (crossOrigin) {
        video.crossOrigin = crossOrigin;
      }

      let settled = false;
      const cleanup = () => {
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
      };
      const onReady = () => {
        if (settled) return;
        settled = true;
        cleanup();
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        resolve({ video, texture });
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('video failed'));
      };

      video.addEventListener('loadeddata', onReady);
      video.addEventListener('canplay', onReady);
      video.addEventListener('error', onError);
      video.src = url;
      video.load();
      const playPromise = video.play?.();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    });
  }

  createFallbackAvatarModel() {
    const geometry = new THREE.IcosahedronGeometry(0.5, 1);
    const material = new THREE.MeshStandardMaterial({
      color: 0x8FA8D8,
      metalness: 0.35,
      roughness: 0.55,
    });
    return new THREE.Mesh(geometry, material);
  }

  getAvatarModelLoader() {
    if (this.avatarModelLoader) return this.avatarModelLoader;
    const loader = createDracoGltfLoader();
    this.avatarModelLoader = loader;
    return loader;
  }

  loadAvatarModelObject(url) {
    if (!isEmbeddableModelUrl(url)) {
      return Promise.resolve(this.createFallbackAvatarModel());
    }

    return new Promise((resolve) => {
      this.getAvatarModelLoader().load(
        url,
        (gltf) => {
          resolve(gltf?.scene ?? this.createFallbackAvatarModel());
        },
        undefined,
        () => {
          resolve(this.createFallbackAvatarModel());
        },
      );
    });
  }

  normalizeAvatarModelObject(object) {
    const root = new THREE.Group();
    root.add(object);

    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const targetSize = Math.max(
      0.5,
      Math.min(
        (sanitizePositiveNumber(this.flagWidth) ?? 1.2) * 0.6,
        (sanitizePositiveNumber(this.flagHeight) ?? 1.2) * 0.6,
      ),
    );

    object.position.sub(center);
    const scale = targetSize / maxDim;
    root.scale.setScalar(scale);
    root.position.set(0, 0, 0.12);
    root.renderOrder = FLAG_RENDER_ORDER + 2;
    return root;
  }

  applyAvatarMedia(candidate) {
    const media = this.resolveAvatarMedia(candidate);
    const mediaUrl = safeTrimmedString(media.avatarMediaUrl ?? media.avatarUrl);

    if (!this.ready && media.avatarMediaType !== 'image') {
      this.textureUrl = this.getResolvedDefaultTextureUrl();
      this.currentTextureUrl = this.textureUrl;
      return;
    }

    const nonce = (this.avatarMediaNonce += 1);

    if (media.avatarMediaType === 'video' && mediaUrl) {
      this.clearAvatarModelResources();
      this.setFlagMeshVisibility(true);
      this.loadAvatarVideoTexture(mediaUrl)
        .then(({ video, texture }) => {
          if (nonce !== this.avatarMediaNonce) {
            texture.dispose?.();
            try {
              video.pause?.();
            } catch {
              // no-op
            }
            return;
          }
          this.clearAvatarVideoResources();
          this.avatarVideoElement = video;
          this.avatarVideoTexture = texture;
          this.avatarMode = 'video';
          this.currentTextureUrl = mediaUrl;
          if (this.flagMesh?.material) {
            const previousMap = this.flagMesh.material.map;
            this.flagMesh.material.map = texture;
            this.flagMesh.material.needsUpdate = true;
            if (previousMap && previousMap !== texture) {
              previousMap.dispose?.();
            }
          }
          const playPromise = video.play?.();
          if (playPromise && typeof playPromise.catch === 'function') {
            playPromise.catch(() => {});
          }
          this.requestFrame();
        })
        .catch(() => {
          if (nonce !== this.avatarMediaNonce) return;
          this.clearStoredAvatarForUrl(mediaUrl);
          this.updateFlagTexture(this.defaultTextureUrl);
        });
      return;
    }

    if (media.avatarMediaType === 'model' && mediaUrl && this.modelReplacementEnabled) {
      this.clearAvatarVideoResources();
      this.setFlagMeshVisibility(false);
      this.loadAvatarModelObject(mediaUrl).then((object) => {
        if (nonce !== this.avatarMediaNonce) {
          this.disposeObjectResources(object);
          return;
        }
        this.clearAvatarModelResources();
        const normalizedObject = this.normalizeAvatarModelObject(object);
        this.avatarModelRoot = normalizedObject;
        this.group.add(normalizedObject);
        this.avatarMode = 'model';
        this.currentTextureUrl = this.getResolvedDefaultTextureUrl();
        this.requestFrame();
      });
      return;
    }

    const imageUrl = media.avatarMediaType === 'image' ? mediaUrl : '';
    this.updateFlagTexture(imageUrl || this.defaultTextureUrl);
  }

  updateFlagTexture(url) {
    this.avatarMediaNonce += 1;
    this.avatarMode = 'image';
    this.clearAvatarModelResources();
    this.clearAvatarVideoResources();
    this.setFlagMeshVisibility(true);

    const trimmed = safeTrimmedString(url);
    const resolved = trimmed ? this.resolveTextureUrl(trimmed) : '';
    const defaultUrl = this.getResolvedDefaultTextureUrl();

    const targetUrl = resolved || defaultUrl;
    if (!targetUrl) return;

    if (this.currentTextureUrl === targetUrl) return;
    this.currentTextureUrl = targetUrl;

    if (!this.ready || !this.flagMesh) {
      this.textureUrl = targetUrl;
      return;
    }

    this.loadTexture(targetUrl)
      .then((texture) => {
        if (!this.flagMesh) return;
        const material = this.flagMesh.material;
        if (!material) return;
        const oldMap = material.map;
        material.map = texture;
        material.needsUpdate = true;
        if (oldMap && oldMap !== texture) {
          oldMap.dispose?.();
        }
        this.requestFrame();
      })
      .catch(() => {
        const fallbackUrl = this.getResolvedDefaultTextureUrl();
        if (targetUrl !== fallbackUrl) {
          this.clearStoredAvatarForUrl(targetUrl);
          this.currentTextureUrl = fallbackUrl;
          this.updateFlagTexture(fallbackUrl);
        }
      });
  }

  clearStoredAvatarForUrl(targetUrl) {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return;
      const session = JSON.parse(raw);
      const user = session?.user;
      if (!user) return;

      const storedMedia = this.resolveAvatarMedia(user);
      const storedUrl = safeTrimmedString(storedMedia.avatarMediaUrl ?? storedMedia.avatarUrl);
      if (!storedUrl) return;

      const resolvedStored = this.resolveTextureUrl(storedUrl) || storedUrl;
      if (safeTrimmedString(resolvedStored) !== safeTrimmedString(targetUrl)) {
        return;
      }

      user.avatarUrl = null;
      user.avatarMediaUrl = null;
      user.avatarMediaType = 'image';
      user.avatarMimeType = null;
      user.avatarFilename = null;
      if ('avatar' in user) {
        user.avatar = null;
      }

      const nextSession = JSON.parse(JSON.stringify(session));
      nextSession.user.avatarUrl = null;
      nextSession.user.avatarMediaUrl = null;
      nextSession.user.avatarMediaType = 'image';
      nextSession.user.avatarMimeType = null;
      nextSession.user.avatarFilename = null;
      if ('avatar' in nextSession.user) {
        nextSession.user.avatar = null;
      }

      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));

      this.currentSession = nextSession;
      const slug = safeTrimmedString(nextSession?.user?.profileSlug);
      if (slug && this.avatarCache) {
        this.avatarCache.delete(slug);
      }

      window.dispatchEvent(
        new CustomEvent('astral:session-changed', {
          detail: { session: nextSession },
        }),
      );
    } catch {
      // no-op
    }
  }

  ensureProfileAvatar(slug, session) {
    if (!slug || typeof fetch !== 'function') return;
    if (this.avatarFetchSlug === slug) return;

    if (this.avatarFetchController && typeof this.avatarFetchController.abort === 'function') {
      this.avatarFetchController.abort();
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    this.avatarFetchController = controller;
    this.avatarFetchSlug = slug;

    this.fetchAvatarForSlug(slug, controller?.signal)
      .then((fetchedMedia) => {
        if (!fetchedMedia) return;
        if (this.sessionProfileSlug !== slug) return;
        this.avatarCache?.set(slug, fetchedMedia);
        this.persistSessionAvatar(session, fetchedMedia, slug);
        this.applyAvatarMedia(fetchedMedia);
      })
      .finally(() => {
        if (this.avatarFetchSlug === slug) {
          this.avatarFetchSlug = null;
        }
        if (this.avatarFetchController === controller) {
          this.avatarFetchController = null;
        }
      });
  }

  fetchAvatarForSlug(slug, signal) {
    if (!slug || typeof fetch !== 'function') {
      return Promise.resolve(null);
    }

    const requestUrl = `${resolveProfileEndpointPrefix()}${encodeURIComponent(slug)}`;

    return fetch(requestUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then((response) => {
        if (!response || !response.ok) return null;
        return response.json().catch(() => null);
      })
      .then((data) => {
        const profile = data?.profile;
        if (!profile || typeof profile !== 'object') return null;
        const normalized = this.resolveAvatarMedia(profile);
        const resolvedUrl = safeTrimmedString(normalized.avatarMediaUrl ?? normalized.avatarUrl);
        if (!resolvedUrl) return null;
        return normalized;
      })
      .catch((error) => {
        if (error && error.name === 'AbortError') {
          return null;
        }
        return null;
      });
  }

  persistSessionAvatar(session, avatarCandidate, slug) {
    if (typeof window === 'undefined') return;
    const normalized = this.resolveAvatarMedia(avatarCandidate);
    const normalizedUrl = safeTrimmedString(normalized.avatarMediaUrl ?? normalized.avatarUrl);
    if (!normalizedUrl) return;

    const sourceSession = session ?? this.currentSession;
    if (!sourceSession || typeof sourceSession !== 'object' || !sourceSession.user) return;

    const currentUserMedia = this.resolveAvatarMedia(sourceSession.user);
    const unchanged =
      safeTrimmedString(currentUserMedia.avatarUrl) === safeTrimmedString(normalized.avatarUrl) &&
      safeTrimmedString(currentUserMedia.avatarMediaUrl) ===
        safeTrimmedString(normalized.avatarMediaUrl) &&
      safeTrimmedString(currentUserMedia.avatarMimeType) ===
        safeTrimmedString(normalized.avatarMimeType) &&
      safeTrimmedString(currentUserMedia.avatarFilename) ===
        safeTrimmedString(normalized.avatarFilename) &&
      currentUserMedia.avatarMediaType === normalized.avatarMediaType;

    if (unchanged) {
      if (slug) {
        this.avatarCache?.set(slug, normalized);
      }
      return;
    }

    const nextSession = {
      ...sourceSession,
      user: {
        ...sourceSession.user,
        avatarUrl: normalized.avatarUrl,
        avatarMediaType: normalized.avatarMediaType,
        avatarMediaUrl: normalized.avatarMediaUrl,
        avatarMimeType: normalized.avatarMimeType,
        avatarFilename: normalized.avatarFilename,
      },
    };

    if ('avatar' in nextSession.user) {
      nextSession.user.avatar = null;
    }

    if (session && session.user) {
      session.user.avatarUrl = normalized.avatarUrl;
      session.user.avatarMediaType = normalized.avatarMediaType;
      session.user.avatarMediaUrl = normalized.avatarMediaUrl;
      session.user.avatarMimeType = normalized.avatarMimeType;
      session.user.avatarFilename = normalized.avatarFilename;
      if ('avatar' in session.user) {
        session.user.avatar = null;
      }
    }

    if (slug) {
      this.avatarCache?.set(slug, normalized);
    }

    this.currentSession = nextSession;

    try {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    } catch {
      // no-op
    }
  }

  getResolvedDefaultTextureUrl() {
    if (!this.resolvedDefaultTextureUrl) {
      this.resolvedDefaultTextureUrl =
        this.resolveTextureUrl(this.defaultTextureUrl) || this.defaultTextureUrl;
    }
    return this.resolvedDefaultTextureUrl;
  }

  resolveTextureUrl(candidate) {
    const trimmed = safeTrimmedString(candidate);
    if (!trimmed) return '';
    const normalizedCandidate = safeTrimmedString(normalizeAvatarUrl(trimmed));
    if (!normalizedCandidate) return '';

    if (/^(data|blob):/i.test(normalizedCandidate)) {
      return normalizedCandidate;
    }

    if (typeof window === 'undefined' || !window.location) {
      return normalizedCandidate;
    }

    try {
      const parsed = new URL(normalizedCandidate, window.location.origin);
      if (!/^https?:$/i.test(parsed.protocol)) {
        return '';
      }
      return parsed.href;
    } catch {
      return '';
    }
  }

  resolveCrossOriginMode(candidate) {
    const trimmed = safeTrimmedString(candidate);
    if (!trimmed) return null;
    if (typeof window === 'undefined' || !window.location?.origin) return null;
    try {
      const parsed = new URL(trimmed, window.location.origin);
      if (parsed.origin === window.location.origin) return null;
      return 'anonymous';
    } catch {
      return null;
    }
  }

  syncSessionState(sessionOverride = null) {
    const session = sessionOverride ?? readSession();
    this.currentSession = session ?? null;

    const user = session?.user ?? null;
    const avatarMedia = user ? this.resolveAvatarMedia(user) : null;
    const avatarUrl = safeTrimmedString(
      avatarMedia ? avatarMedia.avatarMediaUrl ?? avatarMedia.avatarUrl : null,
    );
    const profileSlug = safeTrimmedString(user?.profileSlug);

    if (!user && this.avatarCache?.clear) {
      this.avatarCache.clear();
    }

    const previousSlug = this.sessionProfileSlug;

    if (profileSlug) {
      this.sessionProfileSlug = profileSlug;
      this.homeUrl = '/bridge';
      if (avatarUrl) {
        this.avatarCache?.set(profileSlug, avatarMedia);
      } else if (previousSlug && previousSlug !== profileSlug) {
        this.avatarCache?.delete(previousSlug);
      }
    } else {
      this.sessionProfileSlug = null;
      this.homeUrl = this.defaultHomeUrl;
      if (!avatarUrl && this.avatarCache?.clear) {
        this.avatarCache.clear();
      }
    }

    if (avatarUrl) {
      this.applyAvatarMedia(avatarMedia);
      return;
    }

    if (!profileSlug) {
      this.updateFlagTexture(this.defaultTextureUrl);
      return;
    }

    const cached = this.avatarCache?.get?.(profileSlug);
    if (cached) {
      this.applyAvatarMedia(cached);
      this.persistSessionAvatar(session, cached, profileSlug);
      return;
    }

    this.updateFlagTexture(this.defaultTextureUrl);
    this.ensureProfileAvatar(profileSlug, session);
  }

  onStorage(event) {
    if (!event || event.key !== SESSION_STORAGE_KEY) return;
    this.syncSessionState();
  }

  onSessionEvent(event) {
    const session = event?.detail?.session ?? null;
    this.syncSessionState(session);
  }

  resolveDimensions(texture) {
    let width = sanitizePositiveNumber(this.unscaledWidth ?? this.flagWidth);
    let height = sanitizePositiveNumber(this.unscaledHeight ?? this.flagHeight);

    const texImage = texture?.image;
    if (this.preserveAspect && texImage && texImage.width && texImage.height) {
      const aspect = texImage.width / texImage.height;
      if (Number.isFinite(aspect) && aspect > 0) {
        if (!Number.isFinite(width) || width <= 0) {
          width =
            Number.isFinite(height) && height > 0 ? height * aspect : this.initialHeight * aspect;
        } else if (!Number.isFinite(height) || height <= 0) {
          height = width / aspect;
        } else {
          height = width / aspect;
        }
      }
    }

    if (!Number.isFinite(width) || width <= 0) width = this.initialWidth || 1.6;
    if (!Number.isFinite(height) || height <= 0) height = this.initialHeight || 1.6;

    if (!Number.isFinite(width) || width <= 0) width = 1.6;
    if (!Number.isFinite(height) || height <= 0) height = width;

    return { width, height };
  }

  onResize(viewW, viewH) {
    this.viewport.width = viewW;
    this.viewport.height = viewH;
    this.positionFlag(viewW, viewH);
  }

  onCameraMove() {
    if (!this.viewport.width || !this.viewport.height) return;
    this.positionFlag(this.viewport.width, this.viewport.height);
  }

  positionFlag(viewW, viewH) {
    if (!this.ready || viewW <= 0 || viewH <= 0) return;

    const halfViewportW = viewW / 2;
    const halfViewportH = viewH / 2;
    if (!halfViewportW || !halfViewportH) return;

    const baseShiftX = halfViewportW - this.marginPx;
    const baseShiftY = halfViewportH - this.marginPx;

    const shiftPxX = this.anchorHorizontal === ALIGN_RIGHT ? baseShiftX : -baseShiftX;
    const shiftPxY = this.anchorVertical === ALIGN_BOTTOM ? -baseShiftY : baseShiftY;

    const unitsPerPixelX = (this.camera.right - this.camera.left) / viewW;
    const unitsPerPixelY = (this.camera.top - this.camera.bottom) / viewH;

    const shiftWorldX = (shiftPxX + this.offsetPx.x) * unitsPerPixelX;
    const shiftWorldY = (shiftPxY + this.offsetPx.y) * unitsPerPixelY;

    this.camera.updateMatrixWorld(true);
    this.camera.matrixWorld.extractBasis(this.camRight, this.camUp, this.camForward);
    this.camRight.normalize();
    this.camUp.normalize();
    this.camForward.normalize();

    this.placementShift.copy(this.camRight).multiplyScalar(shiftWorldX);
    this.placementShift.addScaledVector(this.camUp, shiftWorldY);

    this.group.position.set(this.groupOffsetX, this.groupOffsetY, 0);
    this.anchor.position.copy(this.placementShift);

    const cameraDistance = this.camera.position.length();
    const safeMargin = Math.max(this.camera.near * 2, Math.abs(this.depthOffset));
    const maxDistance = cameraDistance - this.camera.near * 1.05;
    const upperBound = Math.max(this.camera.near, maxDistance);
    const forwardDistance = THREE.MathUtils.clamp(
      cameraDistance - safeMargin,
      this.camera.near,
      upperBound,
    );
    this.anchor.position.addScaledVector(this.camForward, forwardDistance);
    this.anchor.updateMatrixWorld(true);
  }

  onFrame(delta) {
    if (this.avatarMode === 'model') return;
    if (!this.ready || !this.flagGeometry || !this.flagBasePositions) return;

    this.time += delta * this.waveSpeed;

    const positions = this.flagGeometry.attributes.position.array;
    const base = this.flagBasePositions;
    const width = this.flagWidth;
    const frequency = this.waveFrequency;
    const amplitude = this.waveAmplitude;
    const ripple = this.verticalRipple;
    const time = this.time;

    for (let i = 0; i < positions.length; i += 3) {
      const bx = base[i];
      const by = base[i + 1];
      const phase = (bx / width + 0.5) * frequency + time;
      const wave = Math.sin(phase);
      const lift = Math.cos(phase) * ripple;
      positions[i] = bx;
      positions[i + 1] = by + lift;
      positions[i + 2] = base[i + 2] + wave * amplitude;
    }

    this.flagGeometry.attributes.position.needsUpdate = true;

    if (this.flagNormalsCountdown <= 0) {
      this.flagGeometry.computeVertexNormals();
      this.flagNormalsCountdown = 2;
    } else {
      this.flagNormalsCountdown -= 1;
    }
  }

  updateAfterViewport() {
    if (this.viewport.width && this.viewport.height) {
      this.positionFlag(this.viewport.width, this.viewport.height);
    }
  }

  getCanvasBounds() {
    return this.renderer?.domElement?.getBoundingClientRect?.() ?? null;
  }

  isPointerWithinCenter(clientX, clientY, bounds) {
    const targetMesh = this.flagHitMesh ?? this.flagMesh;
    if (!this.ready || !targetMesh) return false;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return false;

    const normX = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    const normY = -(((clientY - bounds.top) / bounds.height) * 2 - 1);

    this.pointerNdc.set(normX, normY);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const intersections = this.raycaster.intersectObject(targetMesh, true);
    if (!intersections.length) return false;

    const { uv } = intersections[0];
    if (!uv) return false;

    const dx = uv.x - 0.5;
    const dy = uv.y - 0.5;
    return dx * dx + dy * dy <= this.centerHitRadiusSq;
  }

  onClick(event) {
    const targetMesh = this.flagHitMesh ?? this.flagMesh;
    if (!this.ready || !targetMesh) return null;

    const clientX = Number.isFinite(event?.clientX) ? event.clientX : NaN;
    const clientY = Number.isFinite(event?.clientY) ? event.clientY : NaN;
    if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

    const bounds = event?.canvasBounds ?? this.getCanvasBounds();
    if (!bounds) return null;

    const hit = this.isPointerWithinCenter(clientX, clientY, bounds);
    if (!hit) return null;

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      try {
        const anchor = document.createElement('a');
        anchor.href = this.homeUrl;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();
        if (anchor.parentNode) {
          anchor.parentNode.removeChild(anchor);
        }
      } catch {
        window.location.assign(this.homeUrl);
      }
    }

    return 'flag center → home';
  }

  dispose() {
    if (this.avatarFetchController && typeof this.avatarFetchController.abort === 'function') {
      this.avatarFetchController.abort();
    }
    this.avatarFetchController = null;
    this.avatarFetchSlug = null;
    this.clearAvatarModelResources();
    this.clearAvatarVideoResources();
    if (this.avatarCache?.clear) {
      this.avatarCache.clear();
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', this.onStorage);
      window.removeEventListener('astral:session-changed', this.onSessionEvent);
    }
    this.scene.remove(this.anchor);
    if (this.flagMesh) {
      this.flagMesh.geometry?.dispose?.();
      this.flagMesh.material?.map?.dispose?.();
      this.flagMesh.material?.dispose?.();
    }
    if (this.flagHitMesh) {
      this.flagHitMesh.geometry?.dispose?.();
      this.flagHitMesh.material?.dispose?.();
    }
  }
}
