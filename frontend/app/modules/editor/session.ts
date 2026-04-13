const EDITOR_SESSION_STORAGE_KEY = 'astralpirates-editor-session-id';

export const randomToken = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getOrCreateEditorSessionId = (): string => {
  if (typeof window === 'undefined') return `ssr-${randomToken()}`;
  try {
    const existing = window.sessionStorage.getItem(EDITOR_SESSION_STORAGE_KEY)?.trim();
    if (existing) return existing;
    const created = randomToken();
    window.sessionStorage.setItem(EDITOR_SESSION_STORAGE_KEY, created);
    return created;
  } catch {
    return randomToken();
  }
};
