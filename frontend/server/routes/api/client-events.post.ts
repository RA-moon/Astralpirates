import { defineEventHandler, readBody, createError, getRequestHeader } from 'h3';
import { authorizeClientEventRequest } from '../../utils/client-events';

type ClientEventPayload = {
  message?: string;
  component?: string;
  stack?: string;
  level?: 'error' | 'warn';
  meta?: Record<string, unknown>;
  url?: string;
  userAgent?: string;
};

export default defineEventHandler(async (event) => {
  const { ip } = authorizeClientEventRequest(event);
  const payload = (await readBody<ClientEventPayload | null>(event).catch(() => null)) ?? null;
  if (!payload?.message || typeof payload.message !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid client event payload' });
  }

  const message = payload.message.trim();
  if (!message) {
    throw createError({ statusCode: 400, statusMessage: 'Client event message is required' });
  }

  const entry = {
    message,
    component: payload.component ?? 'unknown',
    stack: payload.stack ?? null,
    meta: payload.meta ?? null,
    url: payload.url ?? null,
    userAgent: payload.userAgent ?? getRequestHeader(event, 'user-agent') ?? null,
    ip,
  };

  const level = payload.level === 'warn' ? 'warn' : 'error';
  // eslint-disable-next-line no-console
  console[level]('[client-event]', entry);

  return { ok: true };
});
