import type { ConnectionOptions } from 'bullmq';

type ExtendedConnectionOptions = ConnectionOptions & {
  maxRetriesPerRequest?: number | null;
  enableReadyCheck?: boolean;
};

let cachedConnection: ExtendedConnectionOptions | null = null;

const parseRedisUrl = (url: string): ExtendedConnectionOptions => {
  try {
    const parsed = new URL(url);
    const connection: ExtendedConnectionOptions = {
      host: parsed.hostname || '127.0.0.1',
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username || undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    };

    if (parsed.pathname && parsed.pathname.length > 1) {
      const dbValue = Number(parsed.pathname.slice(1));
      if (Number.isFinite(dbValue)) {
        connection.db = dbValue;
      }
    }

    if (parsed.protocol === 'rediss:') {
      connection.tls = {};
    }

    return connection;
  } catch (error) {
    console.warn('[queue] Failed to parse REDIS_URL, falling back to defaults', error);
    return {
      host: '127.0.0.1',
      port: 6379,
    };
  }
};

export const getRedisConnectionOptions = (): ExtendedConnectionOptions => {
  if (!cachedConnection) {
    const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
    cachedConnection = parseRedisUrl(url);
    // Recommended BullMQ option to avoid duplicated reconnection warnings.
    cachedConnection.maxRetriesPerRequest = null;
    cachedConnection.enableReadyCheck = false;
  }
  return cachedConnection;
};

export const resetRedisConnectionCache = () => {
  cachedConnection = null;
};
