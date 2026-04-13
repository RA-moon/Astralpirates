import { TextEncoder } from 'node:util';
import type { NextRequest } from 'next/server';

import { authenticateRequest } from '@/app/api/_lib/auth';
import { corsJson } from '@/app/api/_lib/cors';
import {
  loadMembershipWithOwnerFallback,
  normaliseId,
  resolveFlightPlanBySlug,
  sanitizeFlightPlanSlug,
} from '@/app/api/_lib/flightPlanMembers';
import { canUserReadFlightPlan } from '@/app/api/_lib/accessPolicy';
import { buildTaskChannel, type TaskEventEnvelope } from '@/app/api/_lib/flightPlanTaskEvents';
import type { FlightPlanTask } from '@astralpirates/shared/api-contracts';
import { getTaskStreamMetrics } from '@/app/api/_lib/taskStreamMetrics';
import { getRedisClient } from '@/src/utils/redisClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const METHODS = 'GET';
const HEARTBEAT_MS = 25_000;

type RouteParams = { params: Promise<{ slug: string }> };

const isClosedControllerError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'ERR_INVALID_STATE') return true;
  const message =
    typeof (error as { message?: unknown }).message === 'string'
      ? ((error as { message: string }).message ?? '').toLowerCase()
      : '';
  return message.includes('controller is already closed') || message.includes('invalid state');
};

const maskTaskPayload = (task: FlightPlanTask, shouldMask: boolean): FlightPlanTask => {
  if (!shouldMask) return task;
  return {
    ...task,
    title: 'Crew-only task',
    description: [],
    attachments: [],
    links: [],
    assignees: [],
    owner: null,
  };
};

const maskCommentPayload = (comment: any, shouldMask: boolean) => {
  if (!comment || !shouldMask) return comment;
  return {
    ...comment,
    body: [],
    bodyRaw: '',
    bodyHtml: '',
    author: null,
    mentions: [],
    mentionMembershipIds: [],
  };
};

const buildStreamResponse = (stream: ReadableStream) =>
  new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });

export async function GET(
  req: NextRequest,
  context: RouteParams,
) {
  const auth = await authenticateRequest(req);
  const { slug: rawSlug } = await context.params;
  const slug = sanitizeFlightPlanSlug(rawSlug);
  if (!slug) {
    return corsJson(req, { error: 'Invalid flight plan slug.' }, { status: 400 }, METHODS);
  }

  const flightPlanDoc = await resolveFlightPlanBySlug(auth.payload, slug);
  if (!flightPlanDoc) {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  const flightPlanId = normaliseId(flightPlanDoc.id);
  const ownerId = normaliseId((flightPlanDoc as any).owner);
  if (flightPlanId == null) {
    return corsJson(req, { error: 'Flight plan unavailable.' }, { status: 400 }, METHODS);
  }

  const viewerMembership = auth.user
    ? await loadMembershipWithOwnerFallback({
        payload: auth.payload,
        flightPlanId,
        userId: auth.user.id,
        ownerIdHint: ownerId ?? undefined,
      })
    : null;
  const viewerHasMembership = viewerMembership && viewerMembership.status === 'accepted';
  const viewerIsCrew =
    viewerHasMembership &&
    (viewerMembership.role === 'owner' || viewerMembership.role === 'crew');
  const viewerCanStream = canUserReadFlightPlan({
    user: auth.user,
    ownerId,
    membershipRole:
      viewerMembership?.status === 'accepted' ? viewerMembership.role : null,
    policy: (flightPlanDoc as any)?.accessPolicy,
    visibility: (flightPlanDoc as any)?.visibility,
    isPublic: (flightPlanDoc as any)?.isPublic,
    publicContributions: (flightPlanDoc as any)?.publicContributions,
    adminMode: auth.adminMode,
  });

  if (!viewerCanStream) {
    return corsJson(
      req,
      { error: 'Crew access required.' },
      { status: auth.user ? 403 : 401 },
      METHODS,
    );
  }

  const encoder = new TextEncoder();
  const channelName = buildTaskChannel(flightPlanId);
  const maskContent = !viewerIsCrew;
  const metrics = getTaskStreamMetrics(auth.payload.logger ?? console);

  let closed = false;
  let countedConnection = false;
  const subscriber = getRedisClient().duplicate();

  const stream = new ReadableStream({
    async start(controller) {
      auth.payload.logger?.info?.(
        { flightPlanId, viewerId: auth.user?.id ?? null },
        '[flight-plan-task] stream connected',
      );

      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let abortListener: (() => void) | null = null;
      let subscriberSubscribed = false;
      let controllerClosed = false;

      const closeControllerSafely = () => {
        if (controllerClosed) return;
        controllerClosed = true;
        try {
          controller.close();
        } catch (error) {
          if (!isClosedControllerError(error)) {
            metrics?.errors.inc({ stage: 'controller_close' });
            auth.payload.logger.warn(
              { err: error, flightPlanId },
              '[flight-plan-task] failed to close stream controller',
            );
          }
        }
      };

      const errorControllerSafely = (error: unknown) => {
        if (controllerClosed) return;
        controllerClosed = true;
        try {
          controller.error(error);
        } catch (controllerError) {
          if (!isClosedControllerError(controllerError)) {
            metrics?.errors.inc({ stage: 'controller_error' });
            auth.payload.logger.warn(
              { err: controllerError, flightPlanId },
              '[flight-plan-task] failed to signal stream controller error',
            );
          }
        }
      };

      const finalize = async ({ closeController }: { closeController: boolean }) => {
        if (closed) return;
        closed = true;

        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        if (abortListener && req.signal) {
          req.signal.removeEventListener('abort', abortListener);
          abortListener = null;
        }

        try {
          subscriber.removeAllListeners('message');
          if (subscriberSubscribed) {
            await subscriber.unsubscribe(channelName);
            subscriberSubscribed = false;
          }
          await subscriber.quit();
        } catch {
          subscriber.disconnect();
        }

        if (closeController) {
          closeControllerSafely();
        }

        if (countedConnection) {
          countedConnection = false;
          metrics?.connections.dec();
          metrics?.push().catch(() => {});
        }
      };

      const send = (event: string, data: Record<string, unknown>, eventId?: string) => {
        if (closed) return;
        const lines = [];
        if (eventId) lines.push(`id: ${eventId}`);
        lines.push(`event: ${event}`);
        try {
          lines.push(`data: ${JSON.stringify(data)}`);
        } catch {
          lines.push('data: {}');
        }
        lines.push('');
        try {
          controller.enqueue(encoder.encode(`${lines.join('\n')}\n`));
        } catch (error) {
          metrics?.errors.inc({ stage: 'controller_enqueue' });
          if (!isClosedControllerError(error)) {
            auth.payload.logger.warn(
              { err: error, flightPlanId, event },
              '[flight-plan-task] failed to enqueue stream event',
            );
          }
          void finalize({ closeController: false });
          return;
        }
        metrics?.events.inc({ type: event });
      };

      const handleMessage = (channel: string, raw: string) => {
        if (closed || channel !== channelName) return;
        try {
          const parsed = JSON.parse(raw) as TaskEventEnvelope;
          const taskIsCrewOnly =
            typeof parsed.taskIsCrewOnly === 'boolean'
              ? parsed.taskIsCrewOnly
              : Boolean(
                  parsed.task &&
                    typeof (parsed.task as any).isCrewOnly === 'boolean' &&
                    (parsed.task as any).isCrewOnly,
                );
          const shouldMask = Boolean(
            maskContent &&
              taskIsCrewOnly,
          );
          const eventPayload = {
            ...parsed,
            task: parsed.task
              ? maskTaskPayload(parsed.task as FlightPlanTask, shouldMask)
              : undefined,
            comment: parsed.comment ? maskCommentPayload(parsed.comment, shouldMask) : undefined,
          };
          send(parsed.type, eventPayload, parsed.eventId);
        } catch (error) {
          metrics?.errors.inc({ stage: 'payload_parse' });
          auth.payload.logger.warn(
            { err: error, flightPlanId, raw },
            '[flight-plan-task] failed to parse task event payload',
          );
        }
      };

      subscriber.on('message', handleMessage);
      try {
        await subscriber.subscribe(channelName);
        subscriberSubscribed = true;
      } catch (error) {
        metrics?.errors.inc({ stage: 'redis_subscribe' });
        auth.payload.logger.warn(
          { err: error, flightPlanId },
          '[flight-plan-task] failed to subscribe to redis task channel',
        );
        errorControllerSafely(error);
        await finalize({ closeController: false });
        return;
      }

      countedConnection = true;
      metrics?.connections.inc();
      metrics?.push().catch(() => {});

      const lastEventId = req.headers.get('last-event-id');
      send('ready', { flightPlanId, resumedFrom: lastEventId ?? null });
      if (lastEventId) {
        send('consistency-hint', { refresh: true });
      }

      heartbeat = setInterval(() => {
        send('ping', { ts: Date.now() });
      }, HEARTBEAT_MS);
      heartbeat.unref?.();

      const abort = req.signal;
      if (abort?.aborted) {
        await finalize({ closeController: true });
        return;
      }

      abortListener = () => {
        void finalize({ closeController: true });
      };
      abort?.addEventListener('abort', abortListener, { once: true });
    },
    async cancel() {
      if (closed) return;
      closed = true;
      auth.payload.logger?.info?.(
        { flightPlanId, viewerId: auth.user?.id ?? null },
        '[flight-plan-task] stream closed',
      );
      try {
        subscriber.removeAllListeners('message');
        await subscriber.unsubscribe(channelName);
        await subscriber.quit();
      } catch {
        subscriber.disconnect();
      }
      if (countedConnection) {
        metrics?.connections.dec();
        metrics?.push().catch(() => {});
      }
    },
  });

  return buildStreamResponse(stream);
}
