declare module '#imports' {
  export const defineCachedEventHandler: typeof import('nitropack/runtime').defineCachedEventHandler;
  export const useNitroApp: typeof import('nitropack/runtime').useNitroApp;
}

declare module '@unhead/vue' {
  interface ReactiveHead {
    __dangerouslyDisableSanitizersByTagID?: Record<string, string[]>;
  }
}

export {};
