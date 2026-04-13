import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload';
import type { NavigationNode } from '../../payload-types';

import { NAVIGATION_NODE_IDS } from '../collections/NavigationNodes';

type NavigationNodeId = (typeof NAVIGATION_NODE_IDS)[number];

type PageDocument = {
  id: number | string;
  title?: string | null;
  path?: string | null;
  navigation?: {
    nodeId?: string | null;
    label?: string | null;
    description?: string | null;
  } | null;
};

type NavigationDetails = {
  nodeId: NavigationNodeId;
  label: string;
  description: string | null;
  sourcePath: string | null;
};

const NAVIGATION_NODE_ID_SET = new Set<NavigationNodeId>(NAVIGATION_NODE_IDS);

const isNavigationNodeId = (value: unknown): value is NavigationNodeId =>
  typeof value === 'string' && NAVIGATION_NODE_ID_SET.has(value as NavigationNodeId);

const resolveNavigationDetails = (doc: PageDocument): NavigationDetails | null => {
  const navigation = doc.navigation ?? null;
  const nodeId = navigation?.nodeId ?? null;

  if (!isNavigationNodeId(nodeId)) {
    return null;
  }

  const title = typeof doc.title === 'string' ? doc.title : null;
  const label = navigation?.label && navigation.label.trim().length > 0 ? navigation.label : title;
  const description =
    navigation?.description && navigation.description.trim().length > 0
      ? navigation.description
      : null;
  const path = typeof doc.path === 'string' ? doc.path : null;

  return {
    nodeId,
    label: label ?? nodeId,
    description,
    sourcePath: path,
  };
};

export const syncNavigationNode: CollectionAfterChangeHook<PageDocument> = async ({
  doc,
  req,
}) => {
  const details = resolveNavigationDetails(doc);
  if (!details) return;

  const existing = await req.payload.find({
    collection: 'navigation-nodes',
    where: {
      nodeId: {
        equals: details.nodeId,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const existingDoc = existing.docs[0] as NavigationNode | undefined;

  if (!existingDoc) {
    await req.payload.create({
      collection: 'navigation-nodes',
      data: {
        nodeId: details.nodeId,
        label: details.label,
        description: details.description,
        sourcePath: details.sourcePath ?? null,
      },
      draft: false,
      overrideAccess: true,
    });
    return;
  }

  const shouldManageEntry =
    !existingDoc.sourcePath ||
    (details.sourcePath && existingDoc.sourcePath === details.sourcePath);

  if (!shouldManageEntry) {
    return;
  }

  const patch: Record<string, unknown> = {};
  if (existingDoc.label !== details.label) {
    patch.label = details.label;
  }
  if ((existingDoc.description ?? null) !== (details.description ?? null)) {
    patch.description = details.description ?? null;
  }
  if (existingDoc.sourcePath !== (details.sourcePath ?? null)) {
    patch.sourcePath = details.sourcePath ?? null;
  }

  if (Object.keys(patch).length === 0) return;

  await req.payload.update({
    collection: 'navigation-nodes',
    id: existingDoc.id,
    data: patch,
    overrideAccess: true,
  });
};

export const releaseNavigationNode: CollectionAfterDeleteHook<PageDocument> = async ({
  doc,
  req,
}) => {
  if (!doc) return;
  const details = resolveNavigationDetails(doc);
  if (!details) return;

  const existing = await req.payload.find({
    collection: 'navigation-nodes',
    where: {
      nodeId: {
        equals: details.nodeId,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const existingDoc = existing.docs[0] as NavigationNode | undefined;

  if (!existingDoc) return;

  if (existingDoc.sourcePath && existingDoc.sourcePath !== details.sourcePath) {
    return;
  }

  await req.payload.update({
    collection: 'navigation-nodes',
    id: existingDoc.id,
    data: {
      sourcePath: null,
    },
    overrideAccess: true,
  });
};
