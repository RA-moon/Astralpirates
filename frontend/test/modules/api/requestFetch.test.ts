import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveAstralApiBase } from '~/modules/api/requestFetch';

type RuntimeConfig = {
  astralApiBase: string;
  public: {
    astralApiBase: string;
  };
};

const setRuntimeConfig = (config: RuntimeConfig) => {
  (globalThis as any).__mockRuntimeConfig = () => config;
};

describe('resolveAstralApiBase', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    delete (globalThis as any).__mockRuntimeConfig;
  });

  it('uses the configured public API base when it is a browser-reachable URL', () => {
    setRuntimeConfig({
      astralApiBase: 'http://cms:3000',
      public: { astralApiBase: 'https://api.astralpirates.com' },
    });

    expect(resolveAstralApiBase()).toBe('https://api.astralpirates.com');
  });

  it('rewrites Docker service hosts to localhost for browser requests', () => {
    setRuntimeConfig({
      astralApiBase: 'http://cms:3000',
      public: { astralApiBase: 'http://cms:3000' },
    });

    expect(resolveAstralApiBase()).toBe('http://localhost:3000');
  });

  it('keeps Docker service hosts when the browser itself runs on a service hostname', () => {
    setRuntimeConfig({
      astralApiBase: 'http://cms:3000',
      public: { astralApiBase: 'http://cms:3000' },
    });

    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      ...originalWindow,
      location: { origin: 'http://frontend:3001' },
    };

    try {
      expect(resolveAstralApiBase()).toBe('http://cms:3000');
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('keeps relative proxy paths untouched', () => {
    setRuntimeConfig({
      astralApiBase: '/cms-api',
      public: { astralApiBase: '/cms-api' },
    });

    expect(resolveAstralApiBase()).toBe('/cms-api');
  });
});
