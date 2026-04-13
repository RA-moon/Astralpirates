// @ts-nocheck
// Legacy background engine uses dynamic globals; revisit when typing the effect stack.
import * as THREE from 'three';
import { updateIconScale } from '../legacy/icon-scale.js';
import { loadPlugins } from './plugins/registry';
import {
  BACKGROUND_CANVAS_ID,
  COLOR_HUE_SPEED_RANGE,
  DEFAULT_COLOR_SATURATION,
  DEFAULT_FLAG_SETTINGS,
  DEFAULT_MENU_SETTINGS,
  DEFAULT_VALUES_POSITION_OFFSET,
  DEFAULT_VALUES_SETTINGS,
  SELECTOR,
  SHEEN_HUE_SPEED_RANGE,
  TARGET_FPS,
  VALUES_MAX_ROT_SPEED_DEFAULT,
  VALUES_MAX_ROT_SPEED_RANGE,
  VALUES_POINTER_ROT_SCALE_DEFAULT,
  VALUES_POINTER_ROT_SCALE_RANGE,
  VISIBILITY_THRESHOLD,
} from './settings';
import {
  defaultColorHueSpeed,
  defaultSheenHueSpeed,
  ensureDynamicWindowNumber,
  prefersReducedMotion,
} from './utils';
import type {
  BackgroundContext,
  BackgroundHandle,
  BackgroundInitOptions,
  BackgroundPlugin,
  BackgroundRuntimeOptions,
  PointerPayload,
} from './types';

const FRAME_INTERVAL_MS = (1 / TARGET_FPS) * 1000;

const createNoopHandle = (): BackgroundHandle => ({
  dispose() {},
});

const resolveRuntimeOptions = (options?: BackgroundInitOptions): BackgroundRuntimeOptions => ({
  pluginFlags: {
    menuIcon: options?.plugins?.menuIcon !== false,
    valuesIcon: options?.plugins?.valuesIcon !== false,
    flag: options?.plugins?.flag !== false,
  },
  transparentBackground: options?.transparentBackground === true,
});

const isTouchLikePointer = (event: Event | PointerEvent) => {
  const type = (event as PointerEvent)?.pointerType || '';
  return type === 'touch' || type === 'pen';
};

export const mountBackground = (
  container: HTMLElement,
  options?: BackgroundInitOptions,
): BackgroundHandle => {
  if (!container || container.dataset.bgInit === '1' || container.dataset.bgInit === 'reduced') {
    return createNoopHandle();
  }

  const reducePref = prefersReducedMotion();
  const allowMotion = container.dataset.bgAllowMotion === '1';
  if (reducePref && !allowMotion) {
    container.dataset.bgInit = 'reduced';
    return createNoopHandle();
  }
  const reduceMotion = reducePref && !allowMotion;
  container.dataset.bgInit = '1';
  const runtimeOptions = resolveRuntimeOptions(options);

  if (typeof window !== 'undefined' && typeof (window as any).value_rotation_speed !== 'number') {
    (window as any).value_rotation_speed = 1;
  }

  ensureDynamicWindowNumber('hue_sheen_speed', defaultSheenHueSpeed, SHEEN_HUE_SPEED_RANGE);
  ensureDynamicWindowNumber('color_hue_speed', defaultColorHueSpeed, COLOR_HUE_SPEED_RANGE);
  ensureDynamicWindowNumber(
    'values_max_rotation_speed',
    () => VALUES_MAX_ROT_SPEED_DEFAULT,
    VALUES_MAX_ROT_SPEED_RANGE,
  );
  ensureDynamicWindowNumber(
    'values_pointer_rotation_scale',
    () => VALUES_POINTER_ROT_SCALE_DEFAULT,
    VALUES_POINTER_ROT_SCALE_RANGE,
  );

  if (typeof window !== 'undefined' && typeof (window as any).color_saturation !== 'number') {
    (window as any).color_saturation = DEFAULT_COLOR_SATURATION;
  }

  if (typeof window !== 'undefined') {
    const offset = (window as any).values_position_offset;
    if (!offset || typeof offset !== 'object') {
      (window as any).values_position_offset = { ...DEFAULT_VALUES_POSITION_OFFSET };
    }
  }

  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: runtimeOptions.transparentBackground,
    powerPreference: 'low-power',
  });
  const dpr = window.devicePixelRatio || 1;
  const uaDataMobile = typeof navigator !== 'undefined' && navigator.userAgentData?.mobile === true;
  const uaString = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const isDesktop =
    uaDataMobile === false ||
    (!uaDataMobile && !/mobile|android|iphone|ipad|ipod|silk|kindle/i.test(uaString));
  const pixelCap = isDesktop ? 2 : 1.5;
  renderer.setPixelRatio(Math.min(pixelCap, dpr));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 2.0;
  renderer.physicallyCorrectLights = true;
  if (runtimeOptions.transparentBackground) {
    renderer.setClearColor(0x000000, 0);
  } else {
    renderer.setClearColor(0x000000, 1);
  }
  renderer.domElement.id = BACKGROUND_CANVAS_ID;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const orthoSize = 5;
  const camera = new THREE.OrthographicCamera(
    -orthoSize,
    orthoSize,
    orthoSize,
    -orthoSize,
    0.01,
    1000,
  );
  camera.position.set(0, 0, 20);
  const CENTER = new THREE.Vector3(0, 0, 0);
  camera.lookAt(CENTER);

  const R = camera.position.length();
  const xOff = camera.position.x;
  const rPerp = Math.sqrt(Math.max(0, R * R - xOff * xOff));
  const theta = Math.atan2(camera.position.y, camera.position.z);
  const orbitOffset = new THREE.Vector3();

  const hemi = new THREE.HemisphereLight(0xFFFFFF, 0x080820, 0.6);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xFFFFFF, 1.0);
  const fill = new THREE.DirectionalLight(0xFFFFFF, 0.35);
  key.target.position.copy(CENTER);
  fill.target.position.copy(CENTER);
  scene.add(key, key.target, fill, fill.target);
  scene.background = runtimeOptions.transparentBackground ? null : new THREE.Color(0x050505);
  const keyOffset = new THREE.Vector3(1.5, 2.5, 3.0);
  const fillOffset = new THREE.Vector3(-2.5, -1.2, 2.0);
  const _tmp = new THREE.Vector3();

  let disposed = false;
  let viewportVisible = false;
  let docHidden = false;
  let isVisible = false;

  let pointerMovePlugins: BackgroundPlugin[] = [];
  let pointerDownPlugins: BackgroundPlugin[] = [];
  let pointerLeavePlugins: BackgroundPlugin[] = [];
  let clickPlugins: BackgroundPlugin[] = [];
  let framePlugins: BackgroundPlugin[] = [];
  let wantsFramePlugins: BackgroundPlugin[] = [];
  let alwaysAnimatePlugins: BackgroundPlugin[] = [];

  let raf: number | null = null;
  let forceRender = false;
  let lastFrameTime = performance.now();
  let lastRenderTime = lastFrameTime;
  const getCanvasBounds = () => renderer.domElement.getBoundingClientRect();

  const hasActiveWork = () =>
    ((!reduceMotion && alwaysAnimatePlugins.length > 0) ||
      wantsFramePlugins.some(
        (plugin) => typeof plugin.wantsFrame === 'function' && plugin.wantsFrame(),
      )) &&
    isVisible;

  const startFrameLoop = () => {
    if (disposed || raf !== null) return;
    lastFrameTime = performance.now();
    lastRenderTime = lastFrameTime;
    raf = requestAnimationFrame(frame);
  };

  const stopFrameLoop = () => {
    if (raf === null) return;
    cancelAnimationFrame(raf);
    raf = null;
  };

  const requestFrameOnce = () => {
    if (disposed) return;
    forceRender = true;
    startFrameLoop();
  };

  const context: BackgroundContext = {
    scene,
    camera,
    renderer,
    runtimeOptions,
    requestFrame: requestFrameOnce,
    reducedMotion: reduceMotion,
    menuSettings: { ...DEFAULT_MENU_SETTINGS },
    flagSettings: { ...DEFAULT_FLAG_SETTINGS, reduceMotion },
    valuesSettings: {
      ...DEFAULT_VALUES_SETTINGS,
      positionOffset: { ...DEFAULT_VALUES_SETTINGS.positionOffset },
      reduceMotion,
    },
  };

  let plugins: BackgroundPlugin[] = [];

  const rebuildPluginCaches = () => {
    pointerMovePlugins = [];
    pointerDownPlugins = [];
    pointerLeavePlugins = [];
    clickPlugins = [];
    framePlugins = [];
    wantsFramePlugins = [];
    alwaysAnimatePlugins = [];

    for (const plugin of plugins) {
      if (typeof plugin.onPointerMove === 'function') pointerMovePlugins.push(plugin);
      if (typeof plugin.onPointerDown === 'function') pointerDownPlugins.push(plugin);
      if (typeof plugin.onPointerLeave === 'function') pointerLeavePlugins.push(plugin);
      if (typeof plugin.onClick === 'function') clickPlugins.push(plugin);
      if (typeof plugin.onFrame === 'function') framePlugins.push(plugin);
      if (typeof plugin.wantsFrame === 'function') wantsFramePlugins.push(plugin);
      if (!reduceMotion && plugin.alwaysAnimate) alwaysAnimatePlugins.push(plugin);
    }
    if (hasActiveWork()) startFrameLoop();
  };

  (async () => {
    try {
      plugins = await loadPlugins(context);
      if (disposed) return;
      rebuildPluginCaches();
      await Promise.all(
        plugins.map((plugin) => (plugin.init ? Promise.resolve(plugin.init()) : Promise.resolve())),
      );
      if (!disposed) resize();
    } catch {
      // no-op
    }
  })();

  function syncLightsToCamera() {
    camera.updateMatrixWorld(true);
    _tmp.copy(keyOffset);
    camera.localToWorld(_tmp);
    key.position.copy(_tmp);
    key.target.position.copy(CENTER);
    key.target.updateMatrixWorld(true);
    _tmp.copy(fillOffset);
    camera.localToWorld(_tmp);
    fill.position.copy(_tmp);
    fill.target.position.copy(CENTER);
    fill.target.updateMatrixWorld(true);
  }

  function setCamAngle(a: number) {
    orbitOffset.set(xOff, rPerp * Math.sin(a), rPerp * Math.cos(a));
    camera.position.copy(CENTER).add(orbitOffset);
    camera.up.set(0, Math.cos(a), Math.sin(a));
    camera.lookAt(CENTER);
    syncLightsToCamera();
    plugins.forEach((p) => p.onCameraMove?.());
  }

  const buildPointerPayload = (event: any): PointerPayload => ({
    type: event.type,
    clientX: event.clientX,
    clientY: event.clientY,
    pointerType: event.pointerType || 'mouse',
    target: renderer.domElement,
    canvasBounds: getCanvasBounds(),
  });

  const dispatchPointerMove = (payload: PointerPayload) => {
    for (const plugin of pointerMovePlugins) {
      plugin.onPointerMove?.(payload);
    }
  };

  const handlePointerMove = (event: PointerEvent) => {
    dispatchPointerMove(buildPointerPayload(event));
  };

  const handlePointerLeave = () => {
    for (const plugin of pointerLeavePlugins) {
      plugin.onPointerLeave?.();
    }
  };

  let requestGyroPermissionFromPointer: ((pointerType: string) => void) | null = null;
  let removeGyroscopeControls: (() => void) | null = null;

  renderer.domElement.addEventListener('pointermove', handlePointerMove);
  renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

  const handleWindowPointerMove = (event: PointerEvent) => {
    if (!event) return;
    if (event.target === renderer.domElement) return;
    const type = event.pointerType || '';
    if (type === 'touch') return;
    dispatchPointerMove(buildPointerPayload(event));
  };

  const handleWindowPointerLeave = () => {
    handlePointerLeave();
  };

  const dispatchPointerDown = (payload: PointerPayload, { emitClick } = { emitClick: false }) => {
    for (const plugin of pointerDownPlugins) {
      plugin.onPointerDown?.(payload);
    }
    dispatchPointerMove(payload);
    if (emitClick) {
      clickPlugins
        .map((plugin) => plugin.onClick?.(payload))
        .filter((log) => typeof log === 'string' && log.length > 0);
    }
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (renderer?.domElement?.setPointerCapture) {
      try {
        renderer.domElement.setPointerCapture(event.pointerId);
      } catch {
        /* no-op */
      }
    }
    const pointerType = event?.pointerType || '';
    const payload = buildPointerPayload(event);
    dispatchPointerDown(payload, { emitClick: true });
    requestGyroPermissionFromPointer?.(pointerType);
  };

  renderer.domElement.addEventListener('pointerdown', handlePointerDown);

  if (typeof window !== 'undefined') {
    const coarsePointerQuery =
      typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)') : null;
    const hasDeviceOrientation = typeof window.DeviceOrientationEvent !== 'undefined';

    const fallbackHasTouch = () => {
      if (typeof navigator === 'undefined' || navigator === null) return false;
      if (typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 0) return true;
      if (
        typeof (navigator as any).msMaxTouchPoints === 'number' &&
        (navigator as any).msMaxTouchPoints > 0
      )
        return true;
      return false;
    };

    const shouldUseGyroscope = () => {
      if (disposed) return false;
      if (coarsePointerQuery) {
        try {
          if (coarsePointerQuery.matches === true) return true;
        } catch {
          /* ignore matchMedia errors */
        }
      }
      return fallbackHasTouch();
    };

    if (hasDeviceOrientation) {
      const needsPermission = typeof window.DeviceOrientationEvent.requestPermission === 'function';
      const gyroState = {
        active: false,
        baselineBeta: null as number | null,
        baselineGamma: null as number | null,
        pointerX: null as number | null,
        pointerY: null as number | null,
        hasPointerDown: false,
      };
      const GYRO_GAMMA_RANGE = 35;
      const GYRO_BETA_RANGE = 35;
      const GYRO_MOVEMENT_RATIO_X = 0.35;
      const GYRO_MOVEMENT_RATIO_Y = 0.3;
      const GYRO_SMOOTHING = 0.25;
      const GYRO_BASELINE_RECENTER = 0.015;
      let permissionState: 'default' | 'granted' | 'denied' | 'pending' = needsPermission
        ? 'default'
        : 'granted';

      const resetGyroState = () => {
        if (gyroState.hasPointerDown) {
          handlePointerLeave();
        }
        gyroState.baselineBeta = null;
        gyroState.baselineGamma = null;
        gyroState.pointerX = null;
        gyroState.pointerY = null;
        gyroState.hasPointerDown = false;
      };

      const detachGyroscope = () => {
        if (!gyroState.active) return;
        window.removeEventListener('deviceorientation', handleDeviceOrientation as any);
        gyroState.active = false;
        resetGyroState();
      };

      const attachGyroscope = () => {
        if (gyroState.active) return;
        window.addEventListener('deviceorientation', handleDeviceOrientation as any, {
          passive: true,
        });
        gyroState.active = true;
      };

      const updateGyroscopeActivation = () => {
        if (!shouldUseGyroscope() || permissionState !== 'granted') {
          detachGyroscope();
          return;
        }
        attachGyroscope();
      };

      function handleDeviceOrientation(event: DeviceOrientationEvent) {
        if (!shouldUseGyroscope()) {
          detachGyroscope();
          return;
        }
        const { beta, gamma } = event;
        if (!Number.isFinite(beta as number) || !Number.isFinite(gamma as number)) return;

        const bounds = getCanvasBounds();
        const width = bounds?.width ?? 0;
        const height = bounds?.height ?? 0;
        if (!bounds || width <= 0 || height <= 0) return;

        const left = bounds.left;
        const top = bounds.top;
        const centerX = left + width / 2;
        const centerY = top + height / 2;
        const right = left + width;
        const bottom = top + height;

        if (gyroState.baselineBeta === null || gyroState.baselineGamma === null) {
          gyroState.baselineBeta = beta as number;
          gyroState.baselineGamma = gamma as number;
          gyroState.pointerX = centerX;
          gyroState.pointerY = centerY;
        }

        const normalizedGamma = THREE.MathUtils.clamp(
          ((gamma as number) - gyroState.baselineGamma) / GYRO_GAMMA_RANGE,
          -1,
          1,
        );
        const normalizedBeta = THREE.MathUtils.clamp(
          ((beta as number) - gyroState.baselineBeta) / GYRO_BETA_RANGE,
          -1,
          1,
        );

        const targetX = THREE.MathUtils.clamp(
          centerX + normalizedGamma * width * GYRO_MOVEMENT_RATIO_X,
          left,
          right,
        );
        const targetY = THREE.MathUtils.clamp(
          centerY + normalizedBeta * height * GYRO_MOVEMENT_RATIO_Y,
          top,
          bottom,
        );

        if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

        if (gyroState.pointerX === null || gyroState.pointerY === null) {
          gyroState.pointerX = targetX;
          gyroState.pointerY = targetY;
        } else {
          gyroState.pointerX += (targetX - gyroState.pointerX) * GYRO_SMOOTHING;
          gyroState.pointerY += (targetY - gyroState.pointerY) * GYRO_SMOOTHING;
        }

        const payload: PointerPayload = {
          type: 'gyromove',
          clientX: gyroState.pointerX,
          clientY: gyroState.pointerY,
          pointerType: 'unknown',
          target: renderer.domElement,
          canvasBounds: bounds,
        };

        if (!gyroState.hasPointerDown) {
          dispatchPointerDown(payload, { emitClick: false });
          gyroState.hasPointerDown = true;
        } else {
          dispatchPointerMove(payload);
        }

        if (gyroState.baselineBeta !== null && gyroState.baselineGamma !== null) {
          gyroState.baselineBeta +=
            ((beta as number) - gyroState.baselineBeta) * GYRO_BASELINE_RECENTER;
          gyroState.baselineGamma +=
            ((gamma as number) - gyroState.baselineGamma) * GYRO_BASELINE_RECENTER;
        }
      }

      if (coarsePointerQuery?.addEventListener) {
        coarsePointerQuery.addEventListener('change', updateGyroscopeActivation, { passive: true });
      } else if (coarsePointerQuery?.addListener) {
        coarsePointerQuery.addListener(updateGyroscopeActivation);
      }

      updateGyroscopeActivation();

      requestGyroPermissionFromPointer = () => {
        if (!needsPermission) return;
        if (!shouldUseGyroscope()) return;
        if (
          permissionState === 'granted' ||
          permissionState === 'denied' ||
          permissionState === 'pending'
        ) {
          if (permissionState === 'granted') updateGyroscopeActivation();
          return;
        }
        permissionState = 'pending';
        window.DeviceOrientationEvent.requestPermission()
          .then((result) => {
            permissionState = result === 'granted' ? 'granted' : 'denied';
          })
          .catch(() => {
            permissionState = 'denied';
          })
          .finally(() => {
            updateGyroscopeActivation();
          });
      };

      removeGyroscopeControls = () => {
        if (coarsePointerQuery?.removeEventListener) {
          coarsePointerQuery.removeEventListener('change', updateGyroscopeActivation);
        } else if (coarsePointerQuery?.removeListener) {
          coarsePointerQuery.removeListener(updateGyroscopeActivation);
        }
        requestGyroPermissionFromPointer = null;
        detachGyroscope();
      };
    }
  }

  const handlePointerUp = (event: PointerEvent) => {
    if (renderer?.domElement?.releasePointerCapture) {
      try {
        renderer.domElement.releasePointerCapture(event.pointerId);
      } catch {
        /* no-op */
      }
    }
    if (isTouchLikePointer(event)) {
      for (const plugin of pointerLeavePlugins) {
        plugin.onPointerLeave?.();
      }
    }
  };

  renderer.domElement.addEventListener('pointerup', handlePointerUp);
  renderer.domElement.addEventListener('pointercancel', handlePointerUp);

  let removeGlobalPointerListeners: (() => void) | null = null;
  if (typeof window !== 'undefined') {
    const handleGlobalPointerDown = (event: PointerEvent) => {
      if (!isTouchLikePointer(event)) return;
      const target = event?.target as Node | null;
      if (target === renderer.domElement) return;
      if (
        typeof Node !== 'undefined' &&
        target instanceof Node &&
        renderer.domElement.contains(target)
      )
        return;
      handlePointerDown(event);
    };

    const handleGlobalPointerUp = (event: PointerEvent) => {
      if (!isTouchLikePointer(event)) return;
      handlePointerUp(event);
    };

    window.addEventListener('pointerdown', handleGlobalPointerDown, { passive: true });
    window.addEventListener('pointerup', handleGlobalPointerUp, { passive: true });
    window.addEventListener('pointercancel', handleGlobalPointerUp, { passive: true });
    window.addEventListener('pointermove', handleWindowPointerMove, { passive: true });
    window.addEventListener('pointerleave', handleWindowPointerLeave, { passive: true });

    removeGlobalPointerListeners = () => {
      window.removeEventListener('pointerdown', handleGlobalPointerDown);
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerleave', handleWindowPointerLeave);
    };
  }

  function resize() {
    const w = Math.max(1, container.clientWidth || window.innerWidth);
    const h = Math.max(1, container.clientHeight || window.innerHeight);
    renderer.setSize(w, h, false);
    renderer.setViewport(0, 0, w, h);

    updateIconScale(w, h);

    const aspect = w / h;
    const halfH = orthoSize;
    const halfW = halfH * aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();

    plugins.forEach((p) => p.onResize?.(w, h));
    setCamAngle(theta);
    requestFrameOnce();
  }
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  let visibilityObserver: IntersectionObserver | null = null;
  const shouldObserveIntersection =
    runtimeOptions.transparentBackground !== true &&
    typeof window !== 'undefined' &&
    'IntersectionObserver' in window;
  // Optimistic default prevents clipped/fixed overlays from getting stuck in one-frame mode when
  // observer callbacks are delayed, skipped, or inaccurate for transparent layers.
  viewportVisible = true;
  if (shouldObserveIntersection) {
    visibilityObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries.find((item) => item.target === container);
        if (!entry) return;
        viewportVisible = entry.isIntersecting && entry.intersectionRatio > 0;
        updateVisibility();
      },
      { threshold: VISIBILITY_THRESHOLD },
    );
    visibilityObserver.observe(container);
  }
  isVisible = !docHidden && viewportVisible;

  function updateVisibility() {
    const nextVisible = !docHidden && viewportVisible;
    if (isVisible === nextVisible) return;
    isVisible = nextVisible;
    if (!isVisible) {
      stopFrameLoop();
      return;
    }
    if (hasActiveWork()) {
      startFrameLoop();
    } else {
      requestFrameOnce();
    }
  }

  function frame(now: number) {
    raf = null;
    lastFrameTime = now;
    const shouldForceRender = forceRender;
    forceRender = false;

    if (!isVisible && !shouldForceRender) {
      lastRenderTime = now;
      return;
    }

    if (!shouldForceRender && now - lastRenderTime < FRAME_INTERVAL_MS) {
      if (hasActiveWork()) {
        raf = requestAnimationFrame(frame);
      }
      return;
    }

    const delta = (now - lastRenderTime) / 1000;
    lastRenderTime = now;

    for (const plugin of framePlugins) {
      plugin.onFrame?.(delta, now);
    }

    renderer.render(scene, camera);

    if (hasActiveWork()) {
      raf = requestAnimationFrame(frame);
    }
  }
  setCamAngle(theta);
  if (isVisible) {
    requestFrameOnce();
  }

  const handleVisibilityChange = () => {
    docHidden = document.hidden;
    updateVisibility();
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  const teardown = () => {
    if (disposed) return;
    disposed = true;
    stopFrameLoop();
    resizeObserver.disconnect();
    visibilityObserver?.disconnect();
    renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
    renderer.domElement.removeEventListener('pointermove', handlePointerMove);
    renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.removeEventListener('pointerup', handlePointerUp);
    renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
    removeGyroscopeControls?.();
    removeGlobalPointerListeners?.();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    plugins.forEach((p) => p.dispose?.());
    scene.environment = null;
    scene.background = null;
    renderer.dispose();
    renderer.domElement?.remove();
    container.dataset.bgInit = '';
  };

  const disconnectObserver = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      teardown();
      disconnectObserver.disconnect();
    }
  });
  disconnectObserver.observe(document.body, { childList: true, subtree: true });

  return {
    dispose: () => {
      disconnectObserver.disconnect();
      teardown();
    },
  };
};

export const initBackground = (
  selector = SELECTOR,
  options?: BackgroundInitOptions,
): BackgroundHandle => {
  let disposed = false;
  let mountHandle: BackgroundHandle | null = null;
  let searchObserver: MutationObserver | null = null;

  const boot = (target: HTMLElement) => {
    if (disposed) return;
    mountHandle = mountBackground(target, options);
  };

  const node = document.querySelector<HTMLElement>(selector);
  if (node) {
    boot(node);
  } else {
    searchObserver = new MutationObserver((_, obs) => {
      const target = document.querySelector<HTMLElement>(selector);
      if (target) {
        obs.disconnect();
        searchObserver = null;
        boot(target);
      }
    });
    searchObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  return {
    dispose: () => {
      disposed = true;
      searchObserver?.disconnect();
      mountHandle?.dispose();
    },
  };
};
