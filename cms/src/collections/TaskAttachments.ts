import { randomBytes } from 'node:crypto';
import path from 'path';

import type { Access, CollectionAfterDeleteHook, CollectionConfig } from 'payload';
import { can } from '@astralpirates/shared/authorization';

import { hasCrewRole, type CrewUser } from '../access/crew';
import { canEditFlightPlan, normaliseId } from '@/app/api/_lib/flightPlanMembers';
import { resolveTaskAttachmentFileReadAccess } from '@/app/api/_lib/mediaAccess';
import { MEDIA_COLLECTION_CONFIG } from '../storage/mediaConfig';

const attachmentMediaConfig = MEDIA_COLLECTION_CONFIG.tasks;

const randomSuffix = (size = 6): string => randomBytes(size).toString('hex');

const sanitizeStem = (value: string | null | undefined, fallback: string): string => {
  if (!value) return fallback;
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || fallback;
};

const resolveExtension = (filenameValue: string): string => {
  const ext = path.extname(filenameValue || '').toLowerCase();
  if (ext === '.jpeg') return '.jpg';
  if (ext && ext.length <= 6) return ext;
  return '.dat';
};

const extractFlightPlanId = (value: unknown): number | null => normaliseId(value);

const canManageMissionMedia = (user: CrewUser): boolean => {
  const userId = normaliseId(user.id);
  return can('manageMissionMedia', {
    actor: {
      userId,
      isAuthenticated: userId != null,
      websiteRole: user.role ?? null,
    },
  });
};

const formatAttachmentFilename = ({
  originalFilename = 'attachment',
  data,
}: {
  originalFilename?: string;
  data?: Record<string, unknown>;
}) => {
  const planId = extractFlightPlanId(data?.flightPlan) ?? 'plan';
  const stem = sanitizeStem(
    path.basename(originalFilename, path.extname(originalFilename || 'attachment')),
    'attachment',
  );
  const ext = resolveExtension(originalFilename || '');
  return `plan-${planId}-${stem}-${randomSuffix()}${ext}`;
};

const canManageTaskAttachment: Access = async (args) => {
  const { req, data } = args;
  const doc =
    (args as { doc?: unknown }).doc ??
    (args as { originalDoc?: unknown }).originalDoc ??
    null;
  const existingDoc = doc as { flightPlan?: unknown } | null;
  const user = req.user as CrewUser | undefined;
  if (!hasCrewRole(user)) return false;
  if (canManageMissionMedia(user)) return true;

  const planId =
    extractFlightPlanId(data?.flightPlan) ??
    extractFlightPlanId(existingDoc?.flightPlan);

  if (planId == null) {
    return false;
  }

  try {
    return await canEditFlightPlan({
      payload: req.payload,
      flightPlanId: planId,
      userId: user?.id,
      websiteRole: user?.role,
    });
  } catch (error) {
    req.payload.logger.warn(
      { err: error, planId, userId: user?.id },
      '[task-attachments] failed to evaluate access',
    );
    return false;
  }
};

const resolveTaskAttachmentReadTarget = async (
  args: Parameters<Access>[0],
): Promise<Record<string, unknown> | null> => {
  const argsWithDoc = args as { doc?: unknown; id?: unknown };
  const existingDoc =
    argsWithDoc.doc && typeof argsWithDoc.doc === 'object'
      ? (argsWithDoc.doc as Record<string, unknown>)
      : null;
  if (existingDoc) return existingDoc;

  const id = normaliseId(argsWithDoc.id);
  if (id == null) return null;
  try {
    const loaded = await args.req.payload.findByID({
      collection: 'task-attachments',
      id,
      depth: 0,
      overrideAccess: true,
    });
    if (loaded && typeof loaded === 'object') {
      return loaded as unknown as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
};

const canReadTaskAttachment: Access = async (args) => {
  const user = (args.req.user as CrewUser | undefined) ?? null;
  const targetDoc = await resolveTaskAttachmentReadTarget(args);
  if (!targetDoc) {
    // Prevent anonymous metadata scans for list queries.
    return Boolean(user);
  }

  const filename =
    typeof targetDoc.filename === 'string' ? targetDoc.filename.trim() : '';
  if (!filename) return false;

  const access = await resolveTaskAttachmentFileReadAccess({
    payload: args.req.payload as any,
    user,
    relativePath: filename,
  });
  return access.allow;
};

const removeAttachmentFromTask: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const assetId = normaliseId((doc as any)?.id);
  const taskId = normaliseId((doc as any)?.task);
  if (assetId == null || taskId == null) return;

  try {
    const taskDoc = await req.payload.findByID({
      collection: 'flight-plan-tasks',
      id: taskId,
      depth: 0,
      overrideAccess: true,
    });
    const existing = Array.isArray((taskDoc as any)?.attachments)
      ? ((taskDoc as any).attachments as Array<Record<string, unknown>>)
      : [];

    const referencesAsset = (entry: Record<string, unknown>) => {
      const entryAssetId = normaliseId(entry.assetId);
      if (entryAssetId != null) return entryAssetId === assetId;
      if (typeof entry.id === 'string' && entry.id.startsWith('attachment-')) {
        const parsed = normaliseId(entry.id.slice('attachment-'.length));
        return parsed === assetId;
      }
      return false;
    };

    const filtered = existing.filter((entry) => !referencesAsset(entry));
    if (filtered.length === existing.length) return;

    const currentVersion = typeof (taskDoc as any)?.version === 'number' ? (taskDoc as any).version : null;
    await req.payload.update({
      collection: 'flight-plan-tasks',
      id: taskId,
      data: {
        attachments: filtered,
        ...(currentVersion != null ? { version: currentVersion + 1 } : {}),
      },
      overrideAccess: true,
    });
  } catch (error) {
    req.payload.logger?.warn?.(
      { err: error, taskId, assetId },
      '[task-attachments] failed to prune attachment references after delete',
    );
  }
};

const TaskAttachments: CollectionConfig = {
  slug: 'task-attachments',
  access: {
    read: canReadTaskAttachment,
    create: canManageTaskAttachment,
    update: canManageTaskAttachment,
    delete: canManageTaskAttachment,
  },
  admin: {
    useAsTitle: 'filename',
    defaultColumns: ['filename', 'mimeType', 'filesize', 'flightPlan', 'task', 'updatedAt'],
    group: 'Media',
    description: 'Mission task uploads and reference files.',
  },
  upload: {
    staticDir: attachmentMediaConfig.staticDir,
    staticURL: attachmentMediaConfig.staticURL,
    adminThumbnail: 'thumbnail',
    mimeTypes: [
      'image/avif',
      'image/gif',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'text/plain',
    ],
    maxFileSize: attachmentMediaConfig.maxFileSize,
    filename: formatAttachmentFilename,
    imageSizes: [
      {
        name: 'thumbnail',
        width: 480,
        height: 480,
      },
    ],
  } as any,
  fields: [
    {
      name: 'flightPlan',
      type: 'relationship',
      relationTo: 'flight-plans',
      required: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'task',
      type: 'relationship',
      relationTo: 'flight-plan-tasks',
      required: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
    {
      name: 'uploadedBy',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data, req, operation, originalDoc }) => {
        const next = { ...(data ?? {}) };
        const existingUploadedBy = normaliseId(
          (originalDoc as { uploadedBy?: unknown } | undefined)?.uploadedBy,
        );
        if (operation === 'update' && existingUploadedBy != null) {
          next.uploadedBy = existingUploadedBy;
        } else if (req.user) {
          next.uploadedBy = req.user.id;
        }
        return next;
      },
    ],
    afterDelete: [removeAttachmentFromTask],
  },
};

export default TaskAttachments;
