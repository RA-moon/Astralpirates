import 'server-only';

import type { Payload } from 'payload';
import { getPayload } from 'payload';

import payloadConfig from '../../payload.config';

if (!payloadConfig) {
  console.error('[payload] Failed to load config. Ensure "PAYLOAD_CONFIG_PATH" is set and points to payload.config.ts.');
}

export const payloadConfigPromise = Promise.resolve(payloadConfig);

let cachedPayload: Payload | null = null;

export async function getPayloadInstance(): Promise<Payload> {
  if (cachedPayload) return cachedPayload;

  const config = await payloadConfigPromise;
  cachedPayload = await getPayload({
    config,
    cron: true,
  });

  return cachedPayload;
}
