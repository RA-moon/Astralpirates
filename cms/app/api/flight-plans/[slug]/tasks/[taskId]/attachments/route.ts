import type { NextRequest } from 'next/server';

import { authenticateRequest, buildRequestForUser } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  normaliseId,
  resolveFlightPlanBySlug,
  sanitizeFlightPlanSlug,
} from '@/app/api/_lib/flightPlanMembers';
import {
  buildMembershipSummaryMap,
  loadTaskById,
  resolveTaskAttachmentDeliveryUrl,
  serializeTask,
  type FlightPlanTaskAttachment,
} from '@/app/api/_lib/flightPlanTasks';
import { createTaskEvent, publishTaskEvent } from '@/app/api/_lib/flightPlanTaskEvents';
import { resolveMediaModifyAccess } from '@/app/api/_lib/mediaAccess';
import { queueMediaDelete } from '@/src/services/mediaLifecycle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,POST,DELETE';
const MAX_ATTACHMENTS = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
]);

type RouteParams = { params: Promise<{ slug: string; taskId: string }> };

const ensureTaskAccess = async ({
  req,
  auth,
  slug: rawSlug,
  taskId: rawTaskId,
}: {
  req: NextRequest;
  auth: Awaited<ReturnType<typeof authenticateRequest>>;
  slug: string;
  taskId: string;
}) => {
  const slug = sanitizeFlightPlanSlug(rawSlug);
  if (!slug) {
    return {
      response: corsJson(req, { error: 'Invalid flight plan slug.' }, { status: 400 }, METHODS),
    };
  }
  const taskId = normaliseId(rawTaskId);
  if (taskId == null) {
    return {
      response: corsJson(req, { error: 'Invalid task id.' }, { status: 400 }, METHODS),
    };
  }

  const flightPlanDoc = await resolveFlightPlanBySlug(auth.payload, slug);
  if (!flightPlanDoc) {
    return {
      response: corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS),
    };
  }

  const flightPlanId = normaliseId(flightPlanDoc.id);
  const ownerId = normaliseId((flightPlanDoc as any).owner);
  const publicContributions = Boolean((flightPlanDoc as any)?.publicContributions);
  const passengersCanCreateTasks = Boolean(
    (flightPlanDoc as any)?.passengersCanCreateTasks,
  );
  if (flightPlanId == null) {
    return {
      response: corsJson(req, { error: 'Flight plan unavailable.' }, { status: 400 }, METHODS),
    };
  }

  const taskRecord = await loadTaskById(auth.payload, taskId);
  if (!taskRecord || taskRecord.flightPlanId !== flightPlanId) {
    return {
      response: corsJson(req, { error: 'Mission task not found.' }, { status: 404 }, METHODS),
    };
  }

  return {
    task: taskRecord,
    flightPlanId,
    ownerId,
    publicContributions,
    passengersCanCreateTasks,
    planSlug: slug,
    planTitle: typeof (flightPlanDoc as any)?.title === 'string' ? (flightPlanDoc as any).title : null,
  };
};

const toAttachmentSnapshot = (
  doc: any,
  membershipId: number | null,
): FlightPlanTaskAttachment | null => {
  const assetId = normaliseId(doc?.id);
  if (assetId == null) return null;
  const filename = typeof doc?.filename === 'string' ? doc.filename : null;
  const url = resolveTaskAttachmentDeliveryUrl({
    filename,
    url:
      typeof doc?.url === 'string' && doc.url.trim().length
        ? doc.url
        : typeof doc?.thumbnailURL === 'string'
          ? doc.thumbnailURL
          : typeof doc?.sizes?.thumbnail?.url === 'string'
            ? doc.sizes.thumbnail.url
            : null,
  });
  if (!url) return null;
  const thumbnailUrl = resolveTaskAttachmentDeliveryUrl({
    filename,
    url:
      typeof doc?.sizes?.thumbnail?.url === 'string'
        ? doc.sizes.thumbnail.url
        : typeof doc?.thumbnailURL === 'string'
          ? doc.thumbnailURL
          : null,
  });

  return {
    id: `attachment-${assetId}`,
    assetId,
    filename,
    url,
    mimeType: typeof doc?.mimeType === 'string' ? doc.mimeType : null,
    size: typeof doc?.filesize === 'number' ? doc.filesize : null,
    thumbnailUrl,
    addedByMembershipId: membershipId,
    addedAt: new Date().toISOString(),
  };
};

const extractAttachmentId = async (req: NextRequest): Promise<string | null> => {
  const searchId = req.nextUrl.searchParams.get('attachmentId');
  if (typeof searchId === 'string' && searchId.trim().length) {
    return searchId.trim();
  }
  if (req.method !== 'DELETE') return null;
  try {
    const parsed = await req.json();
    if (parsed?.attachmentId && typeof parsed.attachmentId === 'string') {
      const trimmed = parsed.attachmentId.trim();
      return trimmed.length ? trimmed : null;
    }
  } catch {
    // ignore json parse errors for delete bodies
  }
  return null;
};

export async function POST(
  req: NextRequest,
  context: RouteParams,
) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }
  const requesterUserId = normaliseId(auth.user.id);
  const { slug, taskId } = await context.params;
  const preflight = await ensureTaskAccess({ req, auth, slug, taskId });
  if ('response' in preflight) return preflight.response;

  const modifyAccess = await resolveMediaModifyAccess({
    scope: 'task-attachment',
    payload: auth.payload as any,
    user: auth.user,
    action: 'upload',
    flightPlanId: preflight.flightPlanId,
    ownerIdHint: preflight.ownerId ?? undefined,
    passengersCanCreateTasks: preflight.passengersCanCreateTasks,
    isCrewOnly: preflight.task.isCrewOnly,
    taskOwnerMembershipId: preflight.task.ownerMembershipId,
    adminMode: auth.adminMode,
  });
  if (!modifyAccess.allow || !modifyAccess.membership) {
    return corsJson(
      req,
      { error: modifyAccess.allow ? 'Crew access required.' : modifyAccess.error },
      { status: modifyAccess.allow ? 403 : modifyAccess.status },
      METHODS,
    );
  }
  const viewerMembership = modifyAccess.membership;
  const viewerIsCrew = viewerMembership.role === 'owner' || viewerMembership.role === 'crew';
  if (preflight.task.attachments.length >= MAX_ATTACHMENTS) {
    return corsJson(
      req,
      { error: `Attachment limit reached (${MAX_ATTACHMENTS}). Remove one before uploading.` },
      { status: 400 },
      METHODS,
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return corsJson(req, { error: 'Invalid form data.' }, { status: 400 }, METHODS);
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return corsJson(req, { error: 'Attachment file is required.' }, { status: 400 }, METHODS);
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return corsJson(req, { error: 'Unsupported file type.' }, { status: 400 }, METHODS);
  }
  if (file.size > MAX_FILE_SIZE) {
    return corsJson(req, { error: 'Attachment exceeds the 5MB limit.' }, { status: 400 }, METHODS);
  }

  let buffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch {
    return corsJson(req, { error: 'Unable to read attachment content.' }, { status: 400 }, METHODS);
  }

  try {
    let uploadedAssetId: number | null = null;
    let taskUpdated = false;
    const cleanupUpload = async () => {
      if (uploadedAssetId == null || taskUpdated) return;
      try {
        await queueMediaDelete({
          payload: auth.payload as any,
          assetClass: 'task',
          assetId: uploadedAssetId,
          mode: 'force',
          reason: 'task-attachment-upload-rollback',
          requestedByUserId: requesterUserId,
        });
      } catch (error) {
        auth.payload.logger?.warn?.(
          { err: error, flightPlanId: preflight.flightPlanId, taskId: preflight.task.id, uploadedAssetId },
          '[flight-plan-task] failed to cleanup orphaned attachment upload',
        );
      }
    };

    const reqForUser = await buildRequestForUser(auth.payload, auth.user);
    const upload = await auth.payload.create({
      collection: 'task-attachments',
      data: {
        flightPlan: preflight.flightPlanId,
        task: preflight.task.id,
        uploadedBy: auth.user.id,
      },
      draft: false,
      file: {
        data: buffer,
        mimetype: file.type,
        size: buffer.length,
        name: file.name || 'task-attachment.dat',
      },
      req: reqForUser,
      overrideAccess: true,
    });

    uploadedAssetId = normaliseId((upload as any)?.id);
    const snapshot = toAttachmentSnapshot(upload, viewerMembership.id);
    if (!snapshot) {
      await cleanupUpload();
      return corsJson(
        req,
        { error: 'Upload succeeded but attachment could not be saved.' },
        { status: 500 },
        METHODS,
      );
    }

    const nextAttachments = [...preflight.task.attachments, snapshot];
    try {
      await auth.payload.update({
        collection: 'flight-plan-tasks',
        id: preflight.task.id,
        data: {
          attachments: nextAttachments,
          version: (preflight.task.version ?? 1) + 1,
        },
        overrideAccess: true,
      });
      taskUpdated = true;
    } catch (error) {
      await cleanupUpload();
      throw error;
    }

    const updatedTask = await loadTaskById(auth.payload, preflight.task.id);
    if (!updatedTask) {
      return corsJson(req, { error: 'Attachment saved but task could not refresh.' }, { status: 500 }, METHODS);
    }
    const summaries = await buildMembershipSummaryMap(auth.payload, [
      ...new Set([
        updatedTask.ownerMembershipId,
        ...updatedTask.assigneeMembershipIds,
        viewerMembership.id,
      ]),
    ]);
    const maskContent = updatedTask.isCrewOnly && !viewerIsCrew;
    const serializedTask = serializeTask(updatedTask, summaries, { maskContent });

    try {
      await publishTaskEvent({
        payload: auth.payload,
        event: createTaskEvent({
          flightPlanId: preflight.flightPlanId,
          taskId: preflight.task.id,
          type: 'attachment-added',
          attachment: snapshot,
          task: serializedTask,
          version: updatedTask.version,
        }),
      });
    } catch (error) {
      auth.payload.logger?.warn?.(
        { err: error, flightPlanId: preflight.flightPlanId, taskId: preflight.task.id },
        '[flight-plan-task] failed to publish attachment-added event',
      );
    }

    return corsJson(
      req,
      { attachment: snapshot, task: serializedTask },
      { status: 201 },
      METHODS,
    );
  } catch (error) {
    auth.payload.logger.error(
      { err: error, flightPlanId: preflight.flightPlanId, taskId: preflight.task.id },
      '[flight-plan-task] failed to upload attachment',
    );
    return corsJson(req, { error: 'Unable to upload attachment.' }, { status: 500 }, METHODS);
  }
}

export async function DELETE(
  req: NextRequest,
  context: RouteParams,
) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }
  const requesterUserId = normaliseId(auth.user.id);
  const { slug, taskId } = await context.params;
  const preflight = await ensureTaskAccess({ req, auth, slug, taskId });
  if ('response' in preflight) return preflight.response;

  const modifyAccess = await resolveMediaModifyAccess({
    scope: 'task-attachment',
    payload: auth.payload as any,
    user: auth.user,
    action: 'delete',
    flightPlanId: preflight.flightPlanId,
    ownerIdHint: preflight.ownerId ?? undefined,
    passengersCanCreateTasks: preflight.passengersCanCreateTasks,
    isCrewOnly: preflight.task.isCrewOnly,
    taskOwnerMembershipId: preflight.task.ownerMembershipId,
    adminMode: auth.adminMode,
  });
  if (!modifyAccess.allow || !modifyAccess.membership) {
    return corsJson(
      req,
      { error: modifyAccess.allow ? 'Crew access required.' : modifyAccess.error },
      { status: modifyAccess.allow ? 403 : modifyAccess.status },
      METHODS,
    );
  }
  const viewerMembership = modifyAccess.membership;
  const viewerIsCrew = viewerMembership.role === 'owner' || viewerMembership.role === 'crew';

  const attachmentId = await extractAttachmentId(req);
  if (!attachmentId) {
    return corsJson(req, { error: 'Attachment id is required.' }, { status: 400 }, METHODS);
  }

  const target = preflight.task.attachments.find((entry) => entry.id === attachmentId);
  if (!target) {
    return corsJson(req, { error: 'Attachment not found on this task.' }, { status: 404 }, METHODS);
  }

  const filtered = preflight.task.attachments.filter((entry) => entry.id !== attachmentId);

  await auth.payload.update({
    collection: 'flight-plan-tasks',
    id: preflight.task.id,
    data: {
      attachments: filtered,
      version: (preflight.task.version ?? 1) + 1,
    },
    overrideAccess: true,
  });

  try {
    await queueMediaDelete({
      payload: auth.payload as any,
      assetClass: 'task',
      assetId: target.assetId,
      mode: 'safe',
      reason: 'task-attachment-remove',
      requestedByUserId: requesterUserId,
    });
  } catch (error) {
    auth.payload.logger.warn(
      { err: error, attachmentId, taskId: preflight.task.id, assetId: target.assetId },
      '[flight-plan-task] failed to queue attachment asset delete',
    );
  }

  const updatedTask = await loadTaskById(auth.payload, preflight.task.id);
  const summaries = updatedTask
    ? await buildMembershipSummaryMap(auth.payload, [
        ...new Set([
          updatedTask.ownerMembershipId,
          ...updatedTask.assigneeMembershipIds,
          viewerMembership.id,
        ]),
      ])
    : null;
  const maskContent = updatedTask?.isCrewOnly && !viewerIsCrew;
  const serializedTask =
    updatedTask && summaries
      ? serializeTask(updatedTask, summaries, { maskContent })
      : null;

  try {
    await publishTaskEvent({
      payload: auth.payload,
      event: createTaskEvent({
        flightPlanId: preflight.flightPlanId,
        taskId: preflight.task.id,
        type: 'attachment-removed',
        attachment: { id: attachmentId, assetId: target.assetId },
        task: serializedTask ?? undefined,
        version: updatedTask?.version ?? preflight.task.version,
      }),
    });
  } catch (error) {
    auth.payload.logger?.warn?.(
      { err: error, flightPlanId: preflight.flightPlanId, taskId: preflight.task.id },
      '[flight-plan-task] failed to publish attachment-removed event',
    );
  }

  if (serializedTask) {
    return corsJson(req, { task: serializedTask }, { status: 200 }, METHODS);
  }
  return corsEmpty(req, METHODS, 204);
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
