import { ref } from 'vue';

type ErrorInput = {
  statusCode?: number;
  statusMessage?: string;
};

export const useRuntimeConfig = () =>
  (globalThis as any).__mockRuntimeConfig?.() ?? {
    astralApiBase: 'http://localhost:3000',
    public: { astralApiBase: 'http://localhost:3000' },
  };

export const createError = ({ statusCode = 500, statusMessage = 'Error' }: ErrorInput) => {
  const error = new Error(statusMessage);
  (error as any).statusCode = statusCode;
  (error as any).statusMessage = statusMessage;
  return error;
};

export const useState = <T>(key: string, init: () => T) => {
  const store = ((globalThis as any).__mockState ??= new Map());
  if (!store.has(key)) {
    store.set(key, init());
  }
  return {
    get value() {
      return store.get(key) as T;
    },
    set value(next: T) {
      store.set(key, next);
    },
  } as { value: T };
};

export const useFetch = async <T = any>(_url: string, options?: { default?: () => T }) => {
  const mock = (globalThis as any).__mockUseFetch;
  if (typeof mock === 'function') {
    return mock<T>(_url, options);
  }
  const initial = typeof options?.default === 'function' ? options.default() : null;
  return {
    data: ref(initial as T | null),
    pending: ref(false),
    error: ref(null),
  };
};
