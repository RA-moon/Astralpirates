import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsEmpty, corsJson } from '@/app/api/_lib/cors';
import {
  loadMembershipWithOwnerFallback,
  membershipIsAcceptedPassenger,
  membershipMatchesFlightPlan,
  normaliseId,
  resolveFlightPlanBySlug,
  sanitizeFlightPlanSlug,
} from '@/app/api/_lib/flightPlanMembers';
import {
  buildMembershipSummaryMap,
  ensureCrewMembershipForPlan,
  loadTaskById,
  serializeTask,
  type FlightPlanTaskLink,
} from '@/app/api/_lib/flightPlanTasks';
import { parseRequestBody } from '../../helpers';
import { createTaskEvent, publishTaskEvent } from '@/app/api/_lib/flightPlanTaskEvents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'OPTIONS,POST,DELETE';
const MAX_LINKS = 10;

type RouteParams =
  { params: Promise<{ slug: string; taskId: string }> };

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
  };
};

const sanitizeUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.length) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const normalizeLink = (
  value: unknown,
  addedBy: number | null,
): FlightPlanTaskLink | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as { url?: unknown; title?: unknown };
  const url = sanitizeUrl(record.url);
  if (!url) return null;
  const title =
    typeof record.title === 'string' && record.title.trim().length
      ? record.title.trim().slice(0, 160)
      : null;
  return {
    id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    title,
    addedByMembershipId: addedBy,
    addedAt: new Date().toISOString(),
  };
};

const extractLinkId = async (req: NextRequest): Promise<string | null> => {
  const searchId = req.nextUrl.searchParams.get('linkId');
  if (typeof searchId === 'string' && searchId.trim().length) return searchId.trim();
  if (req.method !== 'DELETE') return null;
  try {
    const parsed = await req.json();
    if (parsed?.linkId && typeof parsed.linkId === 'string') {
      const trimmed = parsed.linkId.trim();
      return trimmed.length ? trimmed : null;
    }
  } catch {
    // ignore
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
  const { slug, taskId } = await context.params;
  const preflight = await ensureTaskAccess({ req, auth, slug, taskId });
  if ('response' in preflight) return preflight.response;

  const viewerMembership = await loadMembershipWithOwnerFallback({
    payload: auth.payload,
    flightPlanId: preflight.flightPlanId,
    userId: auth.user.id,
    ownerIdHint: preflight.ownerId ?? undefined,
  });
  if (!viewerMembership || viewerMembership.status !== 'accepted') {
    return corsJson(req, { error: 'Crew access required.' }, { status: 403 }, METHODS);
  }

  const viewerIsCrew = ensureCrewMembershipForPlan(viewerMembership, preflight.flightPlanId);
  const viewerIsPassengerOwner =
    preflight.passengersCanCreateTasks &&
    membershipMatchesFlightPlan(viewerMembership, preflight.flightPlanId) &&
    membershipIsAcceptedPassenger(viewerMembership);
  if (!viewerIsCrew && !viewerIsPassengerOwner) {
    return corsJson(
      req,
      { error: 'Only captains or crew organisers can add links.' },
      { status: 403 },
      METHODS,
    );
  }
  if (preflight.task.isCrewOnly && !viewerIsCrew) {
    return corsJson(
      req,
      { error: 'Crew-only tasks limit link edits to captains and crew organisers.' },
      { status: 403 },
      METHODS,
    );
  }

  if (preflight.task.links.length >= MAX_LINKS) {
    return corsJson(
      req,
      { error: `Link limit reached (${MAX_LINKS}). Remove one before adding.` },
      { status: 400 },
      METHODS,
    );
  }

  const body = await parseRequestBody(req);
  const link = normalizeLink(body, viewerMembership.id);
  if (!link) {
    return corsJson(req, { error: 'Valid URL is required.' }, { status: 400 }, METHODS);
  }

  const nextLinks = [...preflight.task.links, link];
  try {
    await auth.payload.update({
      collection: 'flight-plan-tasks',
      id: preflight.task.id,
      data: {
        links: nextLinks,
        version: (preflight.task.version ?? 1) + 1,
      },
      overrideAccess: true,
    });

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

    await publishTaskEvent({
      payload: auth.payload,
      event: createTaskEvent({
        flightPlanId: preflight.flightPlanId,
        taskId: preflight.task.id,
        type: 'link-added',
        link,
        task: serializedTask ?? undefined,
        version: updatedTask?.version ?? preflight.task.version,
      }),
    });

    return corsJson(
      req,
      { link, task: serializedTask ?? undefined },
      { status: 201 },
      METHODS,
    );
  } catch (error) {
    auth.payload.logger.error(
      { err: error, flightPlanId: preflight.flightPlanId, taskId: preflight.task.id },
      '[flight-plan-task] failed to add link',
    );
    return corsJson(req, { error: 'Unable to save link.' }, { status: 500 }, METHODS);
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
  const { slug, taskId } = await context.params;
  const preflight = await ensureTaskAccess({ req, auth, slug, taskId });
  if ('response' in preflight) return preflight.response;

  const viewerMembership = await loadMembershipWithOwnerFallback({
    payload: auth.payload,
    flightPlanId: preflight.flightPlanId,
    userId: auth.user.id,
    ownerIdHint: preflight.ownerId ?? undefined,
  });
  if (!viewerMembership || viewerMembership.status !== 'accepted') {
    return corsJson(req, { error: 'Crew access required.' }, { status: 403 }, METHODS);
  }
  const viewerIsCrew = ensureCrewMembershipForPlan(viewerMembership, preflight.flightPlanId);
  const viewerIsPassengerOwner =
    preflight.passengersCanCreateTasks &&
    membershipMatchesFlightPlan(viewerMembership, preflight.flightPlanId) &&
    membershipIsAcceptedPassenger(viewerMembership);
  const canDelete =
    viewerIsCrew ||
    (viewerIsPassengerOwner && viewerMembership.id === preflight.task.ownerMembershipId);
  if (!canDelete) {
    return corsJson(
      req,
      { error: 'Only captains, crew organisers, or the task owner can remove links.' },
      { status: 403 },
      METHODS,
    );
  }

  const linkId = await extractLinkId(req);
  if (!linkId) {
    return corsJson(req, { error: 'Link id is required.' }, { status: 400 }, METHODS);
  }

  const target = preflight.task.links.find((entry) => entry.id === linkId);
  if (!target) {
    return corsJson(req, { error: 'Link not found on this task.' }, { status: 404 }, METHODS);
  }

  const filtered = preflight.task.links.filter((entry) => entry.id !== linkId);
  await auth.payload.update({
    collection: 'flight-plan-tasks',
    id: preflight.task.id,
    data: {
      links: filtered,
      version: (preflight.task.version ?? 1) + 1,
    },
    overrideAccess: true,
  });

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

  await publishTaskEvent({
    payload: auth.payload,
    event: createTaskEvent({
      flightPlanId: preflight.flightPlanId,
      taskId: preflight.task.id,
      type: 'link-removed',
      link: target,
      task: serializedTask ?? undefined,
      version: updatedTask?.version ?? preflight.task.version,
    }),
  });

  if (serializedTask) {
    return corsJson(req, { task: serializedTask }, { status: 200 }, METHODS);
  }
  return corsEmpty(req, METHODS, 204);
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
