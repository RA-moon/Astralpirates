import { getRedisClient } from '@/src/utils/redisClient';
import type { EmailTransportSnapshot } from '@/src/utils/emailTransport';

type TransportStateRecord = {
  offlineUntil: number;
  lastError: EmailTransportSnapshot | null;
};

const TRANSPORT_STATE_KEY = 'invites:transport:cooldown';
let fallbackState: TransportStateRecord | null = null;

const resolveFallbackState = (): TransportStateRecord | null => {
  if (!fallbackState) return null;
  if (fallbackState.offlineUntil <= Date.now()) {
    fallbackState = null;
    return null;
  }
  return fallbackState;
};

export const markEmailTransportFailure = async (options: {
  snapshot: EmailTransportSnapshot | null;
  cooldownMs: number;
}) => {
  const offlineUntil = Date.now() + options.cooldownMs;
  const state: TransportStateRecord = {
    offlineUntil,
    lastError: options.snapshot ?? null,
  };

  try {
    await getRedisClient().set(
      TRANSPORT_STATE_KEY,
      JSON.stringify(state),
      'PX',
      options.cooldownMs,
    );
    fallbackState = null;
  } catch (error) {
    fallbackState = state;
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[invites] Failed to persist transport cooldown', { err: error });
    }
  }
};

export const markEmailTransportRecovered = async () => {
  fallbackState = null;
  try {
    await getRedisClient().del(TRANSPORT_STATE_KEY);
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[invites] Failed to clear transport cooldown', { err: error });
    }
  }
};

export const resetEmailTransportState = async () => {
  fallbackState = null;
  try {
    await getRedisClient().del(TRANSPORT_STATE_KEY);
  } catch {
    // ignore during tests
  }
};

export const getEmailTransportStatus = async (): Promise<{
  offline: boolean;
  retryAt: string | null;
  lastError: EmailTransportSnapshot | null;
}> => {
  try {
    const raw = await getRedisClient().get(TRANSPORT_STATE_KEY);
    if (!raw) {
      fallbackState = null;
      return { offline: false, retryAt: null, lastError: null };
    }

    const parsed = JSON.parse(raw) as TransportStateRecord;
    if (parsed.offlineUntil <= Date.now()) {
      await markEmailTransportRecovered();
      return { offline: false, retryAt: null, lastError: null };
    }

    return {
      offline: true,
      retryAt: new Date(parsed.offlineUntil).toISOString(),
      lastError: parsed.lastError ?? null,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[invites] Falling back to in-memory transport status', { err: error });
    }
    const fallback = resolveFallbackState();
    if (!fallback) {
      return { offline: false, retryAt: null, lastError: null };
    }
    return {
      offline: true,
      retryAt: new Date(fallback.offlineUntil).toISOString(),
      lastError: fallback.lastError ?? null,
    };
  }
};
