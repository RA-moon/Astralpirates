import path from 'node:path';
import { fileURLToPath } from 'node:url';

import payload from 'payload';

import type { Payload } from 'payload';
import { loadDefaultEnvOrder } from '../../config/loadEnv.ts';
import { NAVIGATION_NODE_IDS } from '../collections/NavigationNodes';

type PageDoc = {
  id: string | number;
  title?: string | null;
  path?: string | null;
  navigation?: {
    nodeId?: string | null;
    label?: string | null;
    description?: string | null;
  } | null;
};

type NavigationDoc = {
  id: string | number;
  nodeId: string;
  label?: string | null;
  description?: string | null;
  sourcePath?: string | null;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cmsRoot = path.resolve(__dirname, '../..');
const repoRoot = path.resolve(cmsRoot, '..');

loadDefaultEnvOrder(repoRoot, cmsRoot);

const initPayload = async (): Promise<Payload> => {
  const secret = process.env.PAYLOAD_SECRET;
  if (!secret) {
    throw new Error('PAYLOAD_SECRET environment variable is required to reconcile navigation nodes.');
  }
  const configModule = (await import('../../payload.config.ts')).default;
  const config = await configModule;
  return payload.init({
    config,
    secret,
  });
};

const syncNavigationEntry = async (
  client: Payload,
  page: PageDoc,
  existing: NavigationDoc | null,
) => {
  const navigation = page.navigation ?? null;
  if (!navigation?.nodeId) return null;

  const nodeId = navigation.nodeId;
  const label = navigation.label?.trim() || page.title || nodeId;
  const description = navigation.description?.trim() || null;
  const sourcePath = page.path ?? null;

  if (!existing) {
    const created = await client.create({
      collection: 'navigation-nodes',
      data: {
        nodeId,
        label,
        description,
        sourcePath,
      },
      overrideAccess: true,
    });
    return { action: 'created', nodeId, id: created.id };
  }

  let needsUpdate = false;
  const patch: Partial<NavigationDoc> = {};

  if (existing.sourcePath !== sourcePath) {
    patch.sourcePath = sourcePath;
    needsUpdate = true;
  }

  if (navigation.label && existing.label !== label) {
    patch.label = label;
    needsUpdate = true;
  }

  if (navigation.description && (existing.description ?? null) !== description) {
    patch.description = description;
    needsUpdate = true;
  }

  if (!needsUpdate) {
    return null;
  }

  await client.update({
    collection: 'navigation-nodes',
    id: existing.id,
    data: patch,
    overrideAccess: true,
  });

  return { action: 'updated', nodeId, id: existing.id };
};

const main = async () => {
  const client = await initPayload();

  const pagesResult = await client.find({
    collection: 'pages',
    depth: 0,
    limit: 100,
  });

  const navResult = await client.find({
    collection: 'navigation-nodes',
    depth: 0,
    limit: NAVIGATION_NODE_IDS.length + 10,
  });

  const navByNodeId = new Map<string, NavigationDoc>();
  navResult.docs.forEach((doc) => {
    const typed = doc as NavigationDoc;
    navByNodeId.set(typed.nodeId, typed);
  });

  const updates: Array<{ action: string; nodeId: string; id: string | number }> = [];
  const missing: string[] = [];

  for (const page of pagesResult.docs as PageDoc[]) {
    if (!page.navigation?.nodeId) continue;
    const existing = navByNodeId.get(page.navigation.nodeId) ?? null;
    const result = await syncNavigationEntry(client, page, existing);
    if (!existing && !result) {
      missing.push(page.navigation.nodeId);
    }
    if (result) {
      updates.push(result);
    }
  }

  const orphaned: Array<{ id: string | number; nodeId: string }> = [];
  navResult.docs.forEach((doc) => {
    const typed = doc as NavigationDoc;
    if (typed.sourcePath) {
      const matchingPage = pagesResult.docs.find(
        (page) => (page as PageDoc).path === typed.sourcePath,
      );
      if (!matchingPage) {
        orphaned.push({ id: typed.id, nodeId: typed.nodeId });
      }
    }
  });

  client.logger.info(
    {
      updates,
      orphaned,
      missing,
    },
    'Navigation reconciliation complete',
  );

  process.exit(0);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
