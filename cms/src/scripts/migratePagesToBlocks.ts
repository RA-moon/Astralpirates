import path from 'node:path';
import { fileURLToPath } from 'node:url';

import payload from 'payload';

import type { Payload } from 'payload';
import { loadDefaultEnvOrder } from '../../config/loadEnv.ts';
import { pageDefinitions, type PageDefinition } from '../seed/pageDefinitions';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cmsRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(cmsRoot, '..');

loadDefaultEnvOrder(repoRoot, cmsRoot);

const initPayload = async (): Promise<Payload> => {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) {
    throw new Error('PAYLOAD_SECRET environment variable is required to migrate pages.');
  }
  console.log('[migratePages] initialising Payload with provided secret.');
  process.env.PAYLOAD_SECRET = secret;
  const configModule = (await import('../../payload.config.ts')).default;
  const config = await configModule;
  return payload.init({
    config,
    secret,
  });
};

const upsertPage = async (client: Payload, definition: PageDefinition) => {
  const candidates = [definition.path, ...(definition.legacyPaths ?? [])];
  let existing:
    | (Record<string, any> & { id: string | number })
    | null = null;

  for (const pathCandidate of candidates) {
    const result = await client.find({
      collection: 'pages',
      where: { path: { equals: pathCandidate } },
      depth: 0,
      limit: 1,
    });
    if (result.docs.length > 0) {
      existing = result.docs[0] as Record<string, any> & { id: string | number };
      break;
    }
  }

  const data = {
    title: definition.title,
    path: definition.path,
    summary: definition.summary ?? null,
    navigation: definition.navigation ?? null,
    layout: definition.layout,
  };

  if (existing) {
    await client.update({
      collection: 'pages',
      id: existing.id,
      data,
      overrideAccess: true,
    });
    return { action: 'updated', id: existing.id };
  }

  const created = await client.create({
    collection: 'pages',
    data,
    overrideAccess: true,
  });
  return { action: 'created', id: created.id };
};

const main = async () => {
  const client = await initPayload();
  const results: Array<{ path: string; action: string }> = [];

  for (const definition of pageDefinitions) {
    const result = await upsertPage(client, definition);
    results.push({ path: definition.path, action: result.action });
    if (definition.notes?.length) {
      client.logger.info(
        { notes: definition.notes, path: definition.path },
        'Page migration notes',
      );
    }
  }

  client.logger.info({ results }, 'Completed page block migration');
  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
