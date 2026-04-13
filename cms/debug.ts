import { getPayload } from 'payload';
import payloadConfig from './payload.config.ts';

const run = async () => {
  const payload = await getPayload({ config: payloadConfig, cron: false });
  console.log('Payload keys:', Object.keys(payload));
  console.log('routes:', payload.config?.routes);
  await payload.destroy?.();
};

run();
