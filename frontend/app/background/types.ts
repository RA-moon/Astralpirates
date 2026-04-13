// @ts-nocheck
// Background types depend on untyped Three.js globals; revisit when the stack is typed.
import type * as THREE from 'three';

export type PointerPayload = {
  type: string;
  clientX: number;
  clientY: number;
  pointerType: string;
  target: EventTarget | null;
  canvasBounds: DOMRect | null;
};

export type MenuSettings = {
  relativeOffset: number;
  iconRotation: number;
  scaleMultiplier: number;
  sizeTarget: 'legacy-icon' | 'role-menu-object';
  modelUrl: string;
  depthOffset: number;
};

export type FlagSettings = {
  textureUrl: string;
  width?: number;
  height?: number;
  scale: number;
  segmentsW: number;
  segmentsH: number;
  waveAmplitude: number;
  waveFrequency: number;
  waveSpeed: number;
  verticalRipple: number;
  marginPx: number;
  offsetPx: { x: number; y: number };
  anchorHorizontal: 'left' | 'right';
  anchorVertical: 'top' | 'bottom';
  depthOffset: number;
  preserveAspect: boolean;
  centerHitRadius: number;
  homeUrl: string;
  reduceMotion: boolean;
};

export type ValuesSettings = {
  scaleMultiplier: number;
  modelUrl: string;
  rotationSpeedRange: { min: number; max: number };
  maxRotationSpeed: number;
  pointerSpeedMultiplier: number;
  positionOffset: { x: number; y: number; z: number };
  reduceMotion: boolean;
};

export type BackgroundContext = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  runtimeOptions: BackgroundRuntimeOptions;
  requestFrame: () => void;
  reducedMotion: boolean;
  menuSettings: MenuSettings;
  flagSettings: FlagSettings;
  valuesSettings: ValuesSettings;
};

export type BackgroundPlugin = {
  init?(): void | Promise<void>;
  dispose?(): void;
  onPointerMove?(payload: PointerPayload): void;
  onPointerDown?(payload: PointerPayload): void;
  onPointerLeave?(): void;
  onClick?(payload: PointerPayload): string | null | void;
  onResize?(width: number, height: number): void;
  onFrame?(deltaSeconds: number, nowMs: number): void;
  onCameraMove?(): void;
  wantsFrame?(): boolean;
  alwaysAnimate?: boolean;
};

export type BackgroundHandle = {
  dispose(): void;
};

export type BackgroundPluginFlags = {
  menuIcon?: boolean;
  valuesIcon?: boolean;
  flag?: boolean;
};

export type BackgroundInitOptions = {
  plugins?: BackgroundPluginFlags;
  transparentBackground?: boolean;
};

export type BackgroundRuntimeOptions = {
  pluginFlags: Required<BackgroundPluginFlags>;
  transparentBackground: boolean;
};
