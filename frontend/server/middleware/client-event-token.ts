import { defineEventHandler } from 'h3';
import { ensureClientEventCookie } from '../utils/client-events';

const shouldSkip = (path: string | undefined) => {
  if (!path) return true;
  if (path.startsWith('/api/')) return true;
  if (path.startsWith('/_nuxt/')) return true;
  if (path.startsWith('/__nuxt_devtools__')) return true;
  return false;
};

export default defineEventHandler((event) => {
  if (shouldSkip(event.path)) {
    return;
  }
  ensureClientEventCookie(event);
});
