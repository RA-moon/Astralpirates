import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from 'payload';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { deriveFlightPlanVisibility, resolveFlightPlanPolicy } from '@astralpirates/shared/accessPolicy';
import {
  normaliseFlightPlanLifecycleStatus,
  normaliseFlightPlanStatusReason,
} from '@astralpirates/shared/flightPlanLifecycle';

import { assignOwnerOnChange, crewCanEditFlightPlan, flightPlanCreationGuard, makeOwnerField } from '../access/crew';
import { buildAccessPolicyField } from '../fields/accessPolicy';
import { buildGallerySlidesField } from '../fields/gallerySlides';
import { ensureOwnerMembership } from '@/app/api/_lib/flightPlanMembers';
import { resolveFlightPlanMediaVisibility } from '@/app/api/_lib/mediaGovernance';
import { cleanupUnusedFlightPlanGalleryImages } from '../lib/galleryCleanup';
import { collectGalleryImageIdsFromSlides } from '../lib/galleryReferences';
import {
  clearOwnerMediaReferences,
  syncGalleryReferencesForFlightPlan,
} from '../services/mediaLifecycle';
import {
  hasGalleryCleanupContextFlag,
  SKIP_GALLERY_OWNED_CLEANUP,
  SKIP_GALLERY_REFERENCE_PRUNE,
  withGalleryCleanupContextFlag,
} from '../lib/galleryCleanupContext';

const normaliseId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return normaliseId((value as { id?: unknown }).id);
  }
  return null;
};

const syncOwnerMembership: CollectionAfterChangeHook = async ({ doc, req }) => {
  const flightPlanId = normaliseId(doc?.id);
  const ownerId = normaliseId((doc as Record<string, unknown> | null | undefined)?.owner);
  if (flightPlanId == null || ownerId == null) {
    return doc;
  }

  await ensureOwnerMembership({
    payload: req.payload,
    flightPlanId,
    ownerId,
    req,
  });

  return doc;
};

const syncFlightPlanGalleryReferenceLedger: CollectionAfterChangeHook = async ({
  doc,
  req,
}) => {
  const flightPlanId = normaliseId(doc?.id);
  if (flightPlanId == null) return doc;

  await syncGalleryReferencesForFlightPlan({
    payload: req.payload,
    flightPlanId,
    slides: (doc as { gallerySlides?: unknown })?.gallerySlides,
    actorUserId: normaliseId((req.user as { id?: unknown } | null | undefined)?.id),
  });

  return doc;
};

const cleanupUnusedFlightPlanGalleryUploads: CollectionAfterChangeHook = async ({ doc, req }) => {
  if (hasGalleryCleanupContextFlag(req.context, SKIP_GALLERY_OWNED_CLEANUP)) {
    return doc;
  }

  const flightPlanId = normaliseId(doc?.id);
  if (flightPlanId == null) return doc;

  const keepImageIds = collectGalleryImageIdsFromSlides(
    (doc as { gallerySlides?: unknown })?.gallerySlides,
  );
  await cleanupUnusedFlightPlanGalleryImages({
    payload: req.payload,
    req,
    context: req.context,
    flightPlanId,
    keepImageIds,
  });

  return doc;
};

const cleanupFlightPlanGalleryUploadsBeforeDelete: CollectionBeforeDeleteHook = async ({
  id,
  req,
}) => {
  if (hasGalleryCleanupContextFlag(req.context, SKIP_GALLERY_OWNED_CLEANUP)) {
    return;
  }

  const flightPlanId = normaliseId(id);
  if (flightPlanId == null) return;

  const cleanupContext = withGalleryCleanupContextFlag(
    req.context,
    SKIP_GALLERY_REFERENCE_PRUNE,
  );

  await cleanupUnusedFlightPlanGalleryImages({
    payload: req.payload,
    req,
    context: cleanupContext,
    flightPlanId,
    keepImageIds: [],
    strict: true,
  });
};

const clearFlightPlanGalleryReferenceLedgerOnDelete: CollectionAfterDeleteHook = async ({
  doc,
  id,
  req,
}) => {
  const flightPlanId = normaliseId((doc as { id?: unknown } | null | undefined)?.id ?? id);
  if (flightPlanId == null) return;

  await clearOwnerMediaReferences({
    payload: req.payload,
    assetClass: 'gallery',
    ownerType: 'flight-plan',
    ownerId: flightPlanId,
    fieldPath: 'gallerySlides',
    actorUserId: normaliseId((req.user as { id?: unknown } | null | undefined)?.id),
  });
};

const normalizePath: CollectionBeforeValidateHook = async ({ data }) => {
  if (!data) return data;
  const next = { ...data } as Record<string, unknown>;
  const slug = typeof next.slug === 'string' ? next.slug.trim() : '';
  if (slug) {
    next.path = `bridge/flight-plans/${slug}`;
  }
  return next;
};

const normalizeReadAccess: CollectionBeforeValidateHook = async ({ data, originalDoc }) => {
  if (!data) return data;
  const next = { ...data } as Record<string, unknown>;
  const source = {
    ...((originalDoc as Record<string, unknown> | undefined) ?? {}),
    ...next,
  } as Record<string, unknown>;

  const accessPolicy = resolveFlightPlanPolicy({
    policy: source.accessPolicy as any,
    visibility: source.visibility,
    isPublic: source.isPublic,
    publicContributions: source.publicContributions,
  });

  next.accessPolicy = accessPolicy;
  next.visibility = deriveFlightPlanVisibility(accessPolicy);
  next.isPublic = next.visibility === 'public';
  next.mediaVisibility = resolveFlightPlanMediaVisibility(source.mediaVisibility);

  if (typeof source.publicContributions !== 'boolean') {
    next.publicContributions = false;
  } else {
    next.publicContributions = source.publicContributions;
  }
  if (typeof source.passengersCanCommentOnTasks !== 'boolean') {
    next.passengersCanCommentOnTasks = false;
  } else {
    next.passengersCanCommentOnTasks = source.passengersCanCommentOnTasks;
  }

  return next;
};

const normalizeIterationNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.trunc(value));
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
      return Math.max(1, Math.trunc(parsed));
    }
  }
  return 1;
};

const normalizeLifecycleFields: CollectionBeforeValidateHook = async ({ data, operation }) => {
  if (!data) return data;
  const next = { ...data } as Record<string, unknown>;

  const hasStatus = Object.prototype.hasOwnProperty.call(next, 'status');
  if (operation === 'create' || hasStatus) {
    const normalizedStatus = normaliseFlightPlanLifecycleStatus(next.status);
    next.status = normalizedStatus?.status ?? 'planned';
  }

  const hasStatusReason = Object.prototype.hasOwnProperty.call(next, 'statusReason');
  if (operation === 'create' || hasStatusReason) {
    next.statusReason = normaliseFlightPlanStatusReason(next.statusReason);
  }

  const hasIterationNumber = Object.prototype.hasOwnProperty.call(next, 'iterationNumber');
  if (operation === 'create' || hasIterationNumber) {
    next.iterationNumber = normalizeIterationNumber(next.iterationNumber);
  }

  return next;
};

const FlightPlans: CollectionConfig = {
  slug: 'flight-plans',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'eventDate', 'displayDate', 'location', 'updatedAt'],
  },
  access: {
    read: () => true,
    create: flightPlanCreationGuard,
    update: crewCanEditFlightPlan,
    delete: crewCanEditFlightPlan,
  },
  hooks: {
    beforeValidate: [normalizePath, normalizeReadAccess, normalizeLifecycleFields],
    beforeChange: [assignOwnerOnChange],
    beforeDelete: [cleanupFlightPlanGalleryUploadsBeforeDelete],
    afterChange: [
      syncOwnerMembership,
      cleanupUnusedFlightPlanGalleryUploads,
      syncFlightPlanGalleryReferenceLedger,
    ],
    afterDelete: [clearFlightPlanGalleryReferenceLedgerOnDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'listOrder',
      type: 'number',
      admin: {
        description: 'Optional manual ordering index matching legacy index.json ordering.',
      },
    },
    {
      name: 'path',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'summary',
      type: 'textarea',
    },
    {
      name: 'category',
      type: 'select',
      required: true,
      defaultValue: 'project',
      options: [
        { label: 'Project', value: 'project' },
        { label: 'Event', value: 'event' },
        { label: 'Test', value: 'test' },
      ],
      admin: {
        position: 'sidebar',
        description: 'Choose the mission category to help crews filter and browse flight plans.',
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'planned',
      options: [
        { label: 'Planned', value: 'planned' },
        { label: 'Pending', value: 'pending' },
        { label: 'Ongoing', value: 'ongoing' },
        { label: 'On Hold', value: 'on-hold' },
        { label: 'Postponed', value: 'postponed' },
        { label: 'Success', value: 'success' },
        { label: 'Failure', value: 'failure' },
        { label: 'Aborted', value: 'aborted' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Canonical lifecycle status for mission planning and completion tracking.',
      },
    },
    {
      name: 'statusChangedAt',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'statusChangedBy',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'statusReason',
      type: 'textarea',
      maxLength: 500,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'startedAt',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'finishedAt',
      type: 'date',
      index: true,
      admin: {
        position: 'sidebar',
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'series',
      type: 'relationship',
      relationTo: 'flight-plan-series' as any,
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
        description: 'Mission series grouping across iterations.',
      },
    },
    {
      name: 'iterationNumber',
      type: 'number',
      required: true,
      defaultValue: 1,
      min: 1,
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'previousIteration',
      type: 'relationship',
      relationTo: 'flight-plans',
      required: false,
      index: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'location',
      type: 'text',
    },
    {
      name: 'dateCode',
      label: 'Date (raw)',
      type: 'text',
    },
    {
      name: 'displayDate',
      type: 'text',
    },
    {
      name: 'eventDate',
      type: 'date',
    },
    {
      name: 'visibility',
      type: 'select',
      label: 'Mission visibility',
      defaultValue: 'passengers',
      options: [
        {
          label: 'Public',
          value: 'public',
        },
        {
          label: 'Passengers and above',
          value: 'passengers',
        },
        {
          label: 'Crew and above',
          value: 'crew',
        },
        {
          label: 'Captain only',
          value: 'captain',
        },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Unified visibility preset. Detailed access policy is kept in sync below for inheritance and advanced overrides.',
      },
    },
    buildAccessPolicyField({
      defaultRoleSpace: 'flight-plan',
      roleSpaceOptions: ['flight-plan', 'crew'],
      description:
        'Canonical read access policy for this mission. Use crew role-space only for legacy compatibility scenarios.',
    }),
    {
      name: 'mediaVisibility',
      type: 'select',
      label: 'Mission media visibility',
      defaultValue: 'inherit',
      options: [
        {
          label: 'Inherit mission access policy',
          value: 'inherit',
        },
        {
          label: 'Crew and captains only',
          value: 'crew_only',
        },
      ],
      admin: {
        position: 'sidebar',
        description:
          'Override media view scope for mission gallery and task attachments. "Inherit" follows mission access policy; "Crew and captains only" blocks guests and anonymous viewers.',
      },
    },
    {
      name: 'crewCanPromotePassengers',
      type: 'checkbox',
      label: 'Allow crew organisers to promote passengers',
      defaultValue: false,
      admin: {
        description: 'When enabled, accepted crew organisers can promote passengers to crew.',
        position: 'sidebar',
      },
    },
    {
      name: 'passengersCanCreateTasks',
      type: 'checkbox',
      label: 'Allow passengers to create tasks',
      defaultValue: false,
      admin: {
        description: 'When enabled, accepted passengers can create mission tasks and manage their own cards.',
        position: 'sidebar',
      },
    },
    {
      name: 'passengersCanCommentOnTasks',
      type: 'checkbox',
      label: 'Allow passengers to comment on tasks',
      defaultValue: false,
      admin: {
        description:
          'When enabled, accepted passengers can post and vote in mission task discussion threads. Crew-only tasks still block passenger access.',
        position: 'sidebar',
      },
    },
    {
      name: 'isPublic',
      type: 'checkbox',
      label: 'Public mission page',
      defaultValue: false,
      admin: {
        description:
          'Public missions show roster details to everyone. Private missions stay hidden from outsiders and remain visible only to the captain, crew, and accepted passengers.',
        position: 'sidebar',
      },
    },
    {
      name: 'publicContributions',
      type: 'checkbox',
      label: 'Enable public contributions',
      defaultValue: false,
      admin: {
        description:
          'When enabled, any authenticated crew account can view the mission, roster, and claim tasks for themselves. Captains still control edits and new task creation.',
        position: 'sidebar',
      },
    },
    {
      name: 'body',
      type: 'richText',
      required: true,
      editor: lexicalEditor(),
    },
    buildGallerySlidesField({
      name: 'gallerySlides',
      label: 'Mission gallery',
      maxRows: 8,
      description: 'Optional reference media (images, videos, 3D models) to showcase the mission (max 8).',
      defaultImageType: 'upload',
      defaultMediaType: 'image',
      descriptionFieldName: 'caption',
    }),
    makeOwnerField(),
  ],
};

export default FlightPlans;
