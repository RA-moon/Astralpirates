import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsJson } from '@/app/api/_lib/cors';
import { normaliseId, resolveFlightPlanBySlug, sanitizeFlightPlanSlug } from '@/app/api/_lib/flightPlanMembers';
import { buildTaskChannel } from '@/app/api/_lib/flightPlanTaskEvents';
import { getRedisClient } from '@/src/utils/redisClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'GET';
const PUBSUB_TIMEOUT_MS = 2_000;

export async function GET(req: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const auth = await authenticateRequest(req);
  const { slug: rawSlug } = await context.params;
  const slug = sanitizeFlightPlanSlug(rawSlug);
  if (!slug) {
    return corsJson(req, { ok: false, error: 'Invalid flight plan slug.' }, { status: 400 }, METHODS);
  }

  const plan = await resolveFlightPlanBySlug(auth.payload, slug);
  if (!plan) {
    return corsJson(req, { ok: false, error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  try {
    const flightPlanId = normaliseId((plan as any)?.id);
    if (flightPlanId == null) {
      throw new Error('Unable to resolve flight plan id');
    }

    const redis = getRedisClient();
    const pong = await redis.ping();
    if (pong?.toString().toLowerCase() !== 'pong') {
      throw new Error('Redis ping failed');
    }

    const channel = buildTaskChannel(flightPlanId);
    const subscriber = redis.duplicate();
    const probe = `health:${Date.now()}:${Math.random().toString(16).slice(2)}`;

    try {
      await subscriber.subscribe(channel);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          subscriber.off('message', handler);
          reject(new Error('Redis pub/sub timeout'));
        }, PUBSUB_TIMEOUT_MS);

        const handler = (messageChannel: string, message: string) => {
          if (messageChannel !== channel || message !== probe) return;
          clearTimeout(timer);
          subscriber.off('message', handler);
          resolve();
        };

        subscriber.on('message', handler);
        redis.publish(channel, probe).catch((error) => {
          clearTimeout(timer);
          subscriber.off('message', handler);
          reject(error);
        });
      });
    } finally {
      try {
        await subscriber.unsubscribe(channel);
        await subscriber.quit();
      } catch {
        subscriber.disconnect();
      }
    }

    return corsJson(req, { ok: true }, { status: 200 }, METHODS);
  } catch (error) {
    auth.payload.logger?.warn?.({ err: error, slug }, '[flight-plan-task] stream health failed');
    return corsJson(req, { ok: false, error: 'Stream health check failed.' }, { status: 503 }, METHODS);
  }
}
