import { beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { SetupServerApi } from 'msw/node';
import { config } from '@vue/test-utils';

const storage = new Map<string, string>();
const localStorageShim = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storage.set(key, String(value));
  },
  removeItem: (key: string) => {
    storage.delete(key);
  },
  clear: () => {
    storage.clear();
  },
  key: (index: number) => Array.from(storage.keys())[index] ?? null,
  get length() {
    return storage.size;
  },
} as Storage;

const assignLocalStorage = () => {
  try {
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageShim,
      configurable: true,
      writable: true,
    });
  } catch {
    globalThis.localStorage = localStorageShim;
  }

  if (globalThis.window) {
    try {
      Object.defineProperty(globalThis.window, 'localStorage', {
        value: localStorageShim,
        configurable: true,
        writable: true,
      });
    } catch {
      (globalThis.window as Window & { localStorage: Storage }).localStorage = localStorageShim;
    }
  }
};

assignLocalStorage();

config.global.stubs = {
  NuxtLink: {
    name: 'NuxtLink',
    props: ['to'],
    template: '<a :href="to"><slot /></a>',
  },
  ClientOnly: {
    name: 'ClientOnly',
    template: '<slot />',
  },
};

let consoleInfoSpy: ReturnType<typeof vi.spyOn> | null = null;
let mswServer: SetupServerApi | null = null;

beforeAll(() => {
  const originalInfo = globalThis.console.info.bind(globalThis.console);
  consoleInfoSpy = vi.spyOn(globalThis.console, 'info').mockImplementation((...args) => {
    if (String(args[0]).includes('<Suspense> is an experimental feature')) {
      return;
    }
    originalInfo(...args);
  });

  return import('./test/msw/server').then(({ mswServer: server }) => {
    mswServer = server;
    mswServer.listen({ onUnhandledRequest: 'error' });
  });
});

afterEach(() => {
  mswServer?.resetHandlers();
});

afterAll(() => {
  consoleInfoSpy?.mockRestore();
  mswServer?.close();
});
