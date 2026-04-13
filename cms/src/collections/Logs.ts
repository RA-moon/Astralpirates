import type { CollectionConfig } from 'payload';

import type { CollectionBeforeChangeHook } from 'payload';
import { assignOwnerOnChange, makeOwnerField, manageLogsAccess } from '../access/crew';
import { formatLogTitle, parseLogTitle } from '../utils/logTitles';
import {
  TIMESTAMP_SLUG_PATTERN,
  buildLogPath,
  deriveCallSignToken,
  timestampSlugToDate,
  toTimestampLabel,
} from '@astralpirates/shared/logs';

const resolveOwnerId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    const nested = (value as { id?: unknown }).id;
    if (typeof nested === 'number' && Number.isFinite(nested)) return nested;
    if (typeof nested === 'string') {
      const parsed = Number.parseInt(nested, 10);
      return Number.isFinite(parsed) ? parsed : null;
    }
  }
  return null;
};

export const ensureLogMetadata: CollectionBeforeChangeHook = async ({
  data,
  originalDoc,
  req,
  operation,
}) => {
  const payload = req.payload;

  const ownerCandidate = data.owner ?? originalDoc?.owner ?? null;
  const ownerId = resolveOwnerId(ownerCandidate);

  let ownerDoc: any = null;
  if (ownerId != null) {
    try {
      ownerDoc = await payload.findByID({
        collection: 'users',
        id: ownerId,
        depth: 0,
        overrideAccess: true,
      });
    } catch (error) {
      req.payload.logger?.warn?.({ err: error, ownerId }, 'Failed to resolve log owner for title formatting');
    }
    data.owner = ownerId;
  }

  const callSignToken = deriveCallSignToken(ownerDoc ?? { id: ownerId });

  const existingSlug =
    (typeof data.slug === 'string' && data.slug.trim()) ||
    (typeof originalDoc?.slug === 'string' && originalDoc.slug.trim()) ||
    null;

  const existingLogDate =
    (typeof data.logDate === 'string' && data.logDate) ||
    (typeof originalDoc?.logDate === 'string' && originalDoc.logDate) ||
    null;

  const existingCreatedAt =
    (typeof data.createdAt === 'string' && data.createdAt) ||
    (typeof originalDoc?.createdAt === 'string' && originalDoc.createdAt) ||
    null;

  let resolvedDate: Date | null = null;
  if (existingSlug && TIMESTAMP_SLUG_PATTERN.test(existingSlug)) {
    resolvedDate = timestampSlugToDate(existingSlug);
  }
  if (!resolvedDate && existingLogDate) {
    const candidate = new Date(existingLogDate);
    if (!Number.isNaN(candidate.getTime())) resolvedDate = candidate;
  }
  if (!resolvedDate && existingCreatedAt) {
    const candidate = new Date(existingCreatedAt);
    if (!Number.isNaN(candidate.getTime())) resolvedDate = candidate;
  }
  if (!resolvedDate) {
    resolvedDate = new Date();
  }

  const { stamp, slug: defaultSlug } = toTimestampLabel(resolvedDate);
  const finalSlug = existingSlug ?? defaultSlug;
  const finalStamp = TIMESTAMP_SLUG_PATTERN.test(finalSlug) ? finalSlug : stamp;
  const finalDate = timestampSlugToDate(finalSlug) ?? resolvedDate;

  data.slug = finalSlug;
  data.path = buildLogPath(finalSlug);
  data.dateCode = finalStamp;
  data.logDate = finalDate.toISOString();

  const rawHeadline =
    (typeof data.headline === 'string' && data.headline.trim()) ||
    (typeof originalDoc?.headline === 'string' && originalDoc.headline.trim()) ||
    null;

  const parsedTitle = parseLogTitle(data.title ?? originalDoc?.title ?? '');
  const parsedNote = parsedTitle.note?.trim() || null;
  const headline = rawHeadline ?? parsedNote ?? finalStamp;
  if (!headline) {
    throw new Error('Log headline is required.');
  }
  data.headline = headline;

  data.title = formatLogTitle({
    stamp: finalStamp,
    callSign: callSignToken,
    note: headline,
  });
};

const Logs: CollectionConfig = {
  slug: 'logs',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'logDate', 'slug', 'updatedAt'],
  },
  access: {
    read: () => true,
    create: () => true,
    update: manageLogsAccess,
    delete: manageLogsAccess,
  },
  hooks: {
    beforeChange: [assignOwnerOnChange, ensureLogMetadata],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      admin: {
        readOnly: true,
        width: '50%',
      },
    },
    {
      name: 'headline',
      label: 'Title',
      type: 'text',
      required: true,
      admin: {
        description: 'Displayed log title (max 50 characters).',
        width: '50%',
      },
      validate: (value: unknown) => {
        if (typeof value !== 'string' || value.trim().length === 0) {
          return 'Title is required.';
        }
        if (value.trim().length > 50) {
          return 'Title must be 50 characters or fewer.';
        }
        return true;
      },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        width: '50%',
      },
    },
    {
      name: 'path',
      type: 'text',
      required: true,
      unique: true,
      admin: {
        readOnly: true,
        width: '100%',
      },
    },
    {
      name: 'dateCode',
      label: 'Timestamp code',
      type: 'text',
      admin: {
        readOnly: true,
        width: '50%',
      },
    },
    {
      name: 'logDate',
      type: 'date',
      admin: {
        readOnly: true,
        width: '50%',
      },
    },
    {
      name: 'body',
      type: 'textarea',
      required: true,
    },
    {
      name: 'flightPlan',
      type: 'relationship',
      relationTo: 'flight-plans',
      required: false,
      index: true,
      admin: {
        description: 'Optional mission this log pertains to.',
      },
    },
    {
      name: 'flightPlanTombstone',
      type: 'json',
      admin: {
        description: 'Captured when a mission is deleted so logs can show the former mission details.',
        readOnly: true,
      },
    },
    makeOwnerField(),
  ],
};

export default Logs;
