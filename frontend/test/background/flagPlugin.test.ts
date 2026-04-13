import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { FlagPlugin } from '~/background/plugins/flag';

const SESSION_STORAGE_KEY = 'astralpirates-session';
const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const makePlugin = () =>
  new FlagPlugin({
    scene: new THREE.Scene(),
    camera: new THREE.OrthographicCamera(),
    renderer: {
      capabilities: {
        getMaxAnisotropy: () => 1,
      },
    } as unknown as THREE.WebGLRenderer,
    requestFrame: () => {},
  });

describe('FlagPlugin session and CORS handling', () => {
  afterEach(() => {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    delete (globalThis as any).__mockRuntimeConfig;
    delete process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED;
    delete process.env.NUXT_PUBLIC_FLAG_MODEL_REPLACEMENT_ENABLED;
  });

  it('uses the bundled fallback image as the default flag texture', () => {
    const plugin = makePlugin();
    try {
      expect(plugin.defaultTextureUrl).toContain('/assets/images/astralpirates.png');
    } finally {
      plugin.dispose();
    }
  });

  it('drops expired localStorage sessions during initialization', () => {
    const expSeconds = Math.floor(Date.now() / 1000) - 60;
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: 'expired-token',
        exp: expSeconds,
        user: {
          id: 42,
          email: 'captain@astralpirates.com',
          profileSlug: 'captain',
          avatarUrl: '/media/avatars/captain.jpg',
        },
      }),
    );

    const plugin = makePlugin();
    try {
      expect(plugin.currentSession).toBeNull();
      expect(window.localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    } finally {
      plugin.dispose();
    }
  });

  it('keeps valid sessions and updates home URL to bridge profile', () => {
    const expSeconds = Math.floor(Date.now() / 1000) + 3600;
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: 'valid-token',
        exp: expSeconds,
        user: {
          id: 42,
          email: 'captain@astralpirates.com',
          profileSlug: 'captain',
          avatarUrl: '/media/avatars/captain.jpg',
        },
      }),
    );

    const plugin = makePlugin();
    try {
      expect(plugin.currentSession?.user?.profileSlug).toBe('captain');
      expect(plugin.homeUrl).toBe('/bridge');
      expect(plugin.currentTextureUrl).toContain('/api/avatars/file/captain.jpg');
    } finally {
      plugin.dispose();
    }
  });

  it('defaults home URL to Airlock when logged out', () => {
    const plugin = makePlugin();
    try {
      expect(plugin.homeUrl).toBe('/');
    } finally {
      plugin.dispose();
    }
  });

  it('navigates to Airlock when the flag center is clicked while logged out', () => {
    const plugin = makePlugin();
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      plugin.ready = true;
      plugin.flagMesh = {} as unknown as THREE.Mesh;
      plugin.isPointerWithinCenter = () => true;

      const result = plugin.onClick({
        clientX: 20,
        clientY: 20,
        canvasBounds: { left: 0, top: 0, width: 100, height: 100 },
      } as any);

      expect(result).toBe('flag center → home');
      const appended = appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement | undefined;
      expect(appended).toBeDefined();
      expect(new URL(appended!.href, window.location.origin).pathname).toBe('/');
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      appendSpy.mockRestore();
      clickSpy.mockRestore();
      plugin.dispose();
    }
  });

  it('navigates to the profile when the flag center is clicked while logged in', () => {
    const expSeconds = Math.floor(Date.now() / 1000) + 3600;
    window.localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        token: 'valid-token',
        exp: expSeconds,
        user: {
          id: 42,
          email: 'captain@astralpirates.com',
          profileSlug: 'captain',
          avatarUrl: '/media/avatars/captain.jpg',
        },
      }),
    );

    const plugin = makePlugin();
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      plugin.ready = true;
      plugin.flagMesh = {} as unknown as THREE.Mesh;
      plugin.isPointerWithinCenter = () => true;

      const result = plugin.onClick({
        clientX: 20,
        clientY: 20,
        canvasBounds: { left: 0, top: 0, width: 100, height: 100 },
      } as any);

      expect(result).toBe('flag center → home');
      const appended = appendSpy.mock.calls[0]?.[0] as HTMLAnchorElement | undefined;
      expect(appended).toBeDefined();
      expect(new URL(appended!.href, window.location.origin).pathname).toBe('/bridge');
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      appendSpy.mockRestore();
      clickSpy.mockRestore();
      plugin.dispose();
    }
  });

  it('only enables anonymous CORS mode for cross-origin textures', () => {
    const plugin = makePlugin();
    try {
      expect(plugin.resolveCrossOriginMode('/media/avatars/captain.jpg')).toBeNull();
      expect(
        plugin.resolveCrossOriginMode(`${window.location.origin}/media/avatars/captain.jpg`),
      ).toBeNull();
      expect(plugin.resolveCrossOriginMode('https://example.com/avatar.jpg')).toBe('anonymous');
    } finally {
      plugin.dispose();
    }
  });

  it('uses relative API base for profile avatar fetches in dev proxy mode', async () => {
    (globalThis as any).__mockRuntimeConfig = () => ({
      astralApiBase: '/cms-api',
      public: { astralApiBase: '/cms-api' },
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ profile: { avatarUrl: '/media/avatars/captain.jpg' } }),
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as any;

    const plugin = makePlugin();
    try {
      await plugin.fetchAvatarForSlug('captain');
      expect(fetchMock).toHaveBeenCalled();
      expect(fetchMock.mock.calls[0]?.[0]).toBe('/cms-api/api/profiles/captain');
    } finally {
      plugin.dispose();
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to default image mode when tri-mode feature flag is disabled', () => {
    delete process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED;
    const plugin = makePlugin();
    const updateSpy = vi.spyOn(plugin, 'updateFlagTexture').mockImplementation(() => {});

    try {
      plugin.ready = true;
      plugin.flagMesh = {
        visible: true,
        material: {
          map: null,
          needsUpdate: false,
        },
      } as unknown as THREE.Mesh;

      plugin.applyAvatarMedia({
        avatarMediaType: 'video',
        avatarMediaUrl: '/api/avatars/file/captain.mp4',
      });

      expect(updateSpy).toHaveBeenCalledWith(plugin.defaultTextureUrl);
      expect(plugin.avatarMode).toBe('image');
    } finally {
      plugin.dispose();
    }
  });

  it('falls back to default image mode when model replacement flag is disabled', async () => {
    process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED = 'true';
    delete process.env.NUXT_PUBLIC_FLAG_MODEL_REPLACEMENT_ENABLED;
    const plugin = makePlugin();
    const updateSpy = vi.spyOn(plugin, 'updateFlagTexture').mockImplementation(() => {});

    try {
      plugin.ready = true;
      plugin.flagMesh = {
        visible: true,
        material: {
          map: null,
          needsUpdate: false,
        },
      } as unknown as THREE.Mesh;

      plugin.applyAvatarMedia({
        avatarMediaType: 'model',
        avatarMediaUrl: '/api/avatars/file/captain.glb',
      });
      await flushPromises();

      expect(updateSpy).toHaveBeenCalledWith(plugin.defaultTextureUrl);
      expect(plugin.avatarMode).toBe('image');
    } finally {
      plugin.dispose();
    }
  });

  it('activates video mode and maps a video texture when tri-mode is enabled', async () => {
    process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED = 'true';
    const plugin = makePlugin();
    const fakeTexture = { dispose: vi.fn() } as unknown as THREE.VideoTexture;
    const fakeVideo = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      load: vi.fn(),
    } as unknown as HTMLVideoElement;

    vi.spyOn(plugin, 'loadAvatarVideoTexture' as any).mockResolvedValue({
      video: fakeVideo,
      texture: fakeTexture,
    });

    try {
      plugin.ready = true;
      plugin.flagMesh = {
        visible: true,
        material: {
          map: null,
          needsUpdate: false,
        },
      } as unknown as THREE.Mesh;

      plugin.applyAvatarMedia({
        avatarMediaType: 'video',
        avatarMediaUrl: '/api/avatars/file/captain.mp4',
      });
      await flushPromises();

      expect(plugin.avatarMode).toBe('video');
      expect(plugin.flagMesh?.visible).toBe(true);
      expect(plugin.flagMesh?.material?.map).toBe(fakeTexture);
    } finally {
      plugin.dispose();
    }
  });

  it('falls back to default texture when video mode activation fails', async () => {
    process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED = 'true';
    const plugin = makePlugin();
    vi.spyOn(plugin, 'loadAvatarVideoTexture' as any).mockRejectedValue(new Error('video failed'));
    const clearSpy = vi.spyOn(plugin, 'clearStoredAvatarForUrl' as any).mockImplementation(() => {});
    const updateSpy = vi.spyOn(plugin, 'updateFlagTexture').mockImplementation(() => {});

    try {
      plugin.ready = true;
      plugin.flagMesh = {
        visible: true,
        material: {
          map: null,
          needsUpdate: false,
        },
      } as unknown as THREE.Mesh;

      plugin.applyAvatarMedia({
        avatarMediaType: 'video',
        avatarMediaUrl: '/api/avatars/file/captain.mp4',
      });
      await flushPromises();

      expect(clearSpy).toHaveBeenCalledWith('/api/avatars/file/captain.mp4');
      expect(updateSpy).toHaveBeenCalledWith(plugin.defaultTextureUrl);
    } finally {
      plugin.dispose();
    }
  });

  it('hides the flag mesh in model mode and keeps click navigation active via hit mesh', async () => {
    process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED = 'true';
    process.env.NUXT_PUBLIC_FLAG_MODEL_REPLACEMENT_ENABLED = 'true';
    const plugin = makePlugin();
    vi.spyOn(plugin, 'loadAvatarModelObject' as any).mockResolvedValue(new THREE.Mesh());

    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      plugin.ready = true;
      plugin.flagMesh = {
        visible: true,
        material: {
          map: null,
          needsUpdate: false,
        },
      } as unknown as THREE.Mesh;
      plugin.flagHitMesh = {} as unknown as THREE.Mesh;

      plugin.applyAvatarMedia({
        avatarMediaType: 'model',
        avatarMediaUrl: '/api/avatars/file/captain.glb',
      });
      await flushPromises();

      expect(plugin.avatarMode).toBe('model');
      expect(plugin.flagMesh?.visible).toBe(false);

      plugin.isPointerWithinCenter = () => true;
      const clickResult = plugin.onClick({
        clientX: 10,
        clientY: 10,
        canvasBounds: { left: 0, top: 0, width: 100, height: 100 },
      } as any);
      expect(clickResult).toBe('flag center → home');
      expect(appendSpy).toHaveBeenCalled();
      expect(clickSpy).toHaveBeenCalled();
    } finally {
      appendSpy.mockRestore();
      clickSpy.mockRestore();
      plugin.dispose();
    }
  });
});
