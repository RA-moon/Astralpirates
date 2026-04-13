type ClientEventPayload = {
  message: string;
  component?: string;
  stack?: string;
  meta?: Record<string, unknown>;
  level?: 'error' | 'warn';
};

const serializeError = (value: unknown) => {
  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack,
      name: value.name,
    };
  }
  if (typeof value === 'object' && value) {
    return { message: JSON.stringify(value) };
  }
  return { message: typeof value === 'string' ? value : String(value) };
};

const endpoint = '/api/client-events';

const postClientEvent = async (payload: Record<string, unknown>) =>
  fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    keepalive: true,
    credentials: 'same-origin',
  });

const bootstrapClientEventToken = async () =>
  fetch(endpoint, {
    method: 'GET',
    keepalive: true,
    credentials: 'same-origin',
  });

export const reportClientEvent = (payload: ClientEventPayload & { error?: unknown }) => {
  if (process.server) return;
  const eventPayload = {
    message: payload.message,
    component: payload.component,
    stack: payload.stack ?? (payload.error ? serializeError(payload.error).stack : undefined),
    level: payload.level ?? 'error',
    meta: payload.meta,
    url: typeof window !== 'undefined' ? window.location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  };

  if (typeof fetch === 'function') {
    postClientEvent(eventPayload)
      .then(async (response) => {
        if (response.ok || response.status !== 403) {
          return;
        }
        const bootstrap = await bootstrapClientEventToken().catch(() => null);
        if (!bootstrap?.ok) {
          return;
        }
        await postClientEvent(eventPayload).catch(() => null);
      })
      .catch(() => {
        try {
          if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
            const blob = new Blob([JSON.stringify(eventPayload)], { type: 'application/json' });
            navigator.sendBeacon(endpoint, blob);
          }
        } catch {
          // Swallow reporter failures; telemetry is best-effort only.
        }
      });
  }
};
