import Redis from 'ioredis';

let redisClient: Redis | null = null;

const createRedisClient = (): Redis => {
  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/0';
  const client = new Redis(url, {
    lazyConnect: false,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });

  client.on('error', (error) => {
    if (process.env.NODE_ENV !== 'test') {
      console.warn('[redis] connection error', { err: error });
    }
  });

  return client;
};

export const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
};

export const resetRedisClient = async () => {
  if (!redisClient) return;
  try {
    await redisClient.quit();
  } catch {
    redisClient.disconnect();
  } finally {
    redisClient = null;
  }
};

export type RedisClient = Redis;
