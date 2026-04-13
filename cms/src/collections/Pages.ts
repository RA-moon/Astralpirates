import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  CollectionConfig,
} from 'payload';

import { assignOwnerOnChange, makeOwnerField, managePagesAccess } from '../access/crew';
import { PAGE_BLOCKS } from '../fields/pageBlocks';
import { buildAccessPolicyField } from '../fields/accessPolicy';
import { releaseNavigationNode, syncNavigationNode } from '../hooks/pageNavigation';
import { cleanupUnusedPageGalleryImages } from '../lib/galleryCleanup';
import {
  clearOwnerMediaReferences,
  syncGalleryReferencesForPage,
} from '../services/mediaLifecycle';
import {
  hasGalleryCleanupContextFlag,
  SKIP_GALLERY_OWNED_CLEANUP,
  SKIP_GALLERY_REFERENCE_PRUNE,
  withGalleryCleanupContextFlag,
} from '../lib/galleryCleanupContext';
import {
  collectGalleryImageIdsFromPageLayout,
  normaliseGalleryImageId,
} from '../lib/galleryReferences';
import { sanitisePageData } from '../utils/cleanPageLayout';
import { NAVIGATION_NODE_OPTIONS } from './NavigationNodes';

const cleanupUnusedPageGalleryUploads: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (hasGalleryCleanupContextFlag(req.context, SKIP_GALLERY_OWNED_CLEANUP)) {
    return doc;
  }

  const pageId = normaliseGalleryImageId(doc?.id);
  if (pageId == null) return doc;

  const keepImageIds = collectGalleryImageIdsFromPageLayout(
    (doc as { layout?: unknown })?.layout,
  );
  await cleanupUnusedPageGalleryImages({
    payload: req.payload,
    req,
    context: req.context,
    pageId,
    keepImageIds,
  });

  return doc;
};

const syncPageGalleryReferenceLedger: CollectionAfterChangeHook = async ({ doc, req }) => {
  const pageId = normaliseGalleryImageId(doc?.id);
  if (pageId == null) return doc;

  await syncGalleryReferencesForPage({
    payload: req.payload,
    pageId,
    layout: (doc as { layout?: unknown })?.layout,
    actorUserId: normaliseGalleryImageId(
      (req.user as { id?: unknown } | null | undefined)?.id,
    ),
  });

  return doc;
};

const cleanupPageGalleryUploadsOnDelete: CollectionAfterDeleteHook = async ({
  id,
  doc,
  req,
}) => {
  if (hasGalleryCleanupContextFlag(req.context, SKIP_GALLERY_OWNED_CLEANUP)) {
    return;
  }

  const pageId = normaliseGalleryImageId((doc as { id?: unknown } | null | undefined)?.id ?? id);
  if (pageId == null) return;

  await cleanupUnusedPageGalleryImages({
    payload: req.payload,
    req,
    context: req.context,
    pageId,
    keepImageIds: [],
  });

  await clearOwnerMediaReferences({
    payload: req.payload,
    assetClass: 'gallery',
    ownerType: 'page',
    ownerId: pageId,
    fieldPath: 'layout.imageCarousel.slides',
    actorUserId: normaliseGalleryImageId(
      (req.user as { id?: unknown } | null | undefined)?.id,
    ),
  });
};

const cleanupPageGalleryUploadsBeforeDelete: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  if (hasGalleryCleanupContextFlag(req.context, SKIP_GALLERY_OWNED_CLEANUP)) {
    return;
  }

  const pageId = normaliseGalleryImageId(id);
  if (pageId == null) return;

  const cleanupContext = withGalleryCleanupContextFlag(
    req.context,
    SKIP_GALLERY_REFERENCE_PRUNE,
  );

  await cleanupUnusedPageGalleryImages({
    payload: req.payload,
    req,
    context: cleanupContext,
    pageId,
    keepImageIds: [],
    strict: true,
  });
};

const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'path', 'updatedAt'],
  },
  access: {
    read: () => true,
    create: managePagesAccess,
    update: managePagesAccess,
    delete: managePagesAccess,
  },
  hooks: {
    beforeValidate: [({ data }) => (data ? sanitisePageData(data) : data)],
    beforeChange: [assignOwnerOnChange],
    beforeDelete: [cleanupPageGalleryUploadsBeforeDelete],
    afterChange: [
      syncNavigationNode,
      cleanupUnusedPageGalleryUploads,
      syncPageGalleryReferenceLedger,
    ],
    afterDelete: [releaseNavigationNode, cleanupPageGalleryUploadsOnDelete],
  },
  fields: [
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
    },
    {
      name: 'path',
      label: 'Path',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        description: 'Matches the public route, e.g., gangway/about or bridge.',
      },
    },
    {
      name: 'summary',
      label: 'Summary',
      type: 'textarea',
      required: false,
      admin: {
        description: 'Optional short blurb for search or previews.',
      },
    },
    buildAccessPolicyField({
      defaultRoleSpace: 'crew',
      roleSpaceOptions: ['crew'],
      hideRoleSpace: true,
      description:
        'Defines who can read this page. Leave empty for the default public page behavior.',
    }),
    {
      name: 'navigation',
      label: 'Navigation overrides',
      type: 'group',
      admin: {
        description: 'Keep in sync with navigation nodes; label/description are optional overrides.',
      },
      fields: [
        {
          name: 'nodeId',
          label: 'Navigation node',
          type: 'select',
          required: false,
          options: NAVIGATION_NODE_OPTIONS,
        },
        {
          name: 'label',
          label: 'Navigation label',
          type: 'text',
          required: false,
        },
        {
          name: 'description',
          label: 'Navigation description',
          type: 'textarea',
          required: false,
        },
      ],
    },
    {
      name: 'layout',
      label: 'Content blocks',
      type: 'blocks',
      blocks: PAGE_BLOCKS,
      required: true,
      minRows: 1,
    },
    makeOwnerField(),
  ],
};

export default Pages;
