import { describe, beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { initBackground } from '~/background';

const loadPluginsMock = vi.fn();

vi.mock('~/background/plugins/registry', () => ({
  loadPlugins: (...args: unknown[]) => loadPluginsMock(...args),
}));

vi.mock('three', async () => {
  const actual = await vi.importActual<any>('three');

  class StubRenderer {
    domElement: HTMLCanvasElement;
    outputColorSpace?: unknown;
    toneMapping?: unknown;
    toneMappingExposure?: unknown;
    physicallyCorrectLights?: unknown;
    capabilities = { getMaxAnisotropy: () => 1 };

    constructor() {
      this.domElement = document.createElement('canvas');
      Object.assign(this.domElement, {
        getBoundingClientRect: () =>
          ({
            left: 0,
            top: 0,
            width: 240,
            height: 240,
            right: 240,
            bottom: 240,
            x: 0,
            y: 0,
            toJSON: () => ({}),
          }) as DOMRect,
      });
      (this.domElement as any).setPointerCapture = vi.fn();
      (this.domElement as any).releasePointerCapture = vi.fn();
    }

    setPixelRatio() {}
    setClearColor() {}
    setSize() {}
    setViewport() {}
    render() {}
    dispose() {}
  }

  return {
    ...actual,
    WebGLRenderer: StubRenderer,
  };
});

const createPointerEvent = (type: string, props: Partial<PointerEvent> = {}) => {
  const EventCtor = (globalThis as any).PointerEvent ?? Event;
  const event = new EventCtor(type, { bubbles: true, cancelable: true });
  Object.assign(event, props);
  return event as PointerEvent;
};

beforeAll(() => {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };

  (globalThis as any).IntersectionObserver = class {
    callback: (entries: IntersectionObserverEntry[]) => void;
    constructor(cb: (entries: IntersectionObserverEntry[]) => void) {
      this.callback = cb;
    }

    observe(target: Element) {
      this.callback([
        { target, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry,
      ]);
    }

    disconnect() {}
  };

  if (!globalThis.requestAnimationFrame) {
    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0);
    (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
  }
});

beforeEach(() => {
  document.body.innerHTML = '';
  loadPluginsMock.mockReset();
  (window as any).matchMedia = vi.fn(() => ({
    matches: false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('initBackground', () => {
  it('mounts the background and forwards pointer events to plugins', async () => {
    const onPointerDown = vi.fn();
    const onClick = vi.fn();
    const onResize = vi.fn();
    const dispose = vi.fn();
    loadPluginsMock.mockResolvedValue([
      {
        init: vi.fn(),
        onPointerDown,
        onPointerMove: vi.fn(),
        onResize,
        onClick,
        dispose,
      },
    ]);

    document.body.innerHTML = '<section id="bg-wrap"></section>';

    const handle = initBackground();
    expect(handle).toBeTruthy();

    await vi.waitFor(() => expect(onResize).toHaveBeenCalled());

    const canvas = document.querySelector('canvas');
    expect(canvas).toBeTruthy();
    canvas?.dispatchEvent(createPointerEvent('pointerdown', { clientX: 10, clientY: 10 }));

    expect(onPointerDown).toHaveBeenCalled();
    expect(onClick).toHaveBeenCalled();

    handle.dispose();
    expect(dispose).toHaveBeenCalled();
    const wrap = document.getElementById('bg-wrap');
    expect(wrap?.dataset.bgInit).toBe('');
  });

  it('keeps animating when IntersectionObserver does not emit entries', async () => {
    const OriginalIntersectionObserver = (globalThis as any).IntersectionObserver;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0);
    (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
    (globalThis as any).IntersectionObserver = class {
      observe() {}
      disconnect() {}
    };

    try {
      const onFrame = vi.fn();
      const onResize = vi.fn();
      const dispose = vi.fn();
      loadPluginsMock.mockResolvedValue([
        {
          init: vi.fn(),
          onResize,
          onFrame,
          alwaysAnimate: true,
          dispose,
        },
      ]);

      document.body.innerHTML = '<section id="bg-wrap"></section>';

      const handle = initBackground();
      await vi.waitFor(() => expect(onResize).toHaveBeenCalled());
      await vi.waitFor(
        () => {
          expect(onFrame.mock.calls.length).toBeGreaterThan(1);
        },
        { timeout: 1_500 },
      );

      handle.dispose();
      expect(dispose).toHaveBeenCalled();
    } finally {
      (globalThis as any).IntersectionObserver = OriginalIntersectionObserver;
      (globalThis as any).requestAnimationFrame = originalRequestAnimationFrame;
      (globalThis as any).cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it('keeps transparent overlays animating when IntersectionObserver reports non-intersecting', async () => {
    const OriginalIntersectionObserver = (globalThis as any).IntersectionObserver;
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    const originalCancelAnimationFrame = globalThis.cancelAnimationFrame;

    (globalThis as any).requestAnimationFrame = (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 0);
    (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
    (globalThis as any).IntersectionObserver = class {
      callback: (entries: IntersectionObserverEntry[]) => void;
      constructor(cb: (entries: IntersectionObserverEntry[]) => void) {
        this.callback = cb;
      }

      observe(target: Element) {
        this.callback([
          { target, isIntersecting: false, intersectionRatio: 0 } as IntersectionObserverEntry,
        ]);
      }

      disconnect() {}
    };

    try {
      const onFrame = vi.fn();
      const onResize = vi.fn();
      const dispose = vi.fn();
      loadPluginsMock.mockResolvedValue([
        {
          init: vi.fn(),
          onResize,
          onFrame,
          alwaysAnimate: true,
          dispose,
        },
      ]);

      document.body.innerHTML = '<section id="bg-wrap"></section>';

      const handle = initBackground(undefined, { transparentBackground: true });
      await vi.waitFor(() => expect(onResize).toHaveBeenCalled());
      await vi.waitFor(
        () => {
          expect(onFrame.mock.calls.length).toBeGreaterThan(1);
        },
        { timeout: 1_500 },
      );

      handle.dispose();
      expect(dispose).toHaveBeenCalled();
    } finally {
      (globalThis as any).IntersectionObserver = OriginalIntersectionObserver;
      (globalThis as any).requestAnimationFrame = originalRequestAnimationFrame;
      (globalThis as any).cancelAnimationFrame = originalCancelAnimationFrame;
    }
  });

  it('honors reduced-motion preferences', () => {
    (window as any).matchMedia = vi.fn(() => ({
      matches: true,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    document.body.innerHTML = '<section id="bg-wrap"></section>';

    const handle = initBackground();
    expect(handle).toBeTruthy();
    expect(loadPluginsMock).not.toHaveBeenCalled();

    const wrap = document.getElementById('bg-wrap');
    expect(wrap?.dataset.bgInit).toBe('reduced');
    handle.dispose();
  });
});
