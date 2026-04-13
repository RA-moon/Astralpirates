import { randomUUID } from 'node:crypto';
import type { Payload } from 'payload';

import { getRedisClient } from '@/src/utils/redisClient';

export type TaskEventType =
  | 'task-created'
  | 'task-updated'
  | 'task-deleted'
  | 'task-moved'
  | 'comment-created'
  | 'comment-updated'
  | 'comment-deleted'
  | 'attachment-added'
  | 'attachment-removed'
  | 'link-added'
  | 'link-removed';

export type TaskEventEnvelope = {
  eventId: string;
  flightPlanId: number;
  taskId: number;
  type: TaskEventType;
  happenedAt: string;
  version?: number;
  taskIsCrewOnly?: boolean;
  task?: unknown;
  previousState?: string | null;
  comment?: unknown;
  attachment?: unknown;
  link?: unknown;
  consistencyHint?: boolean;
};

export const buildTaskChannel = (flightPlanId: number) =>
  `flight-plan-tasks:${flightPlanId}`;

export const publishTaskEvent = async ({
  payload,
  event,
}: {
  payload: Payload;
  event: TaskEventEnvelope;
}): Promise<void> => {
  try {
    const redis = getRedisClient();
    await redis.publish(buildTaskChannel(event.flightPlanId), JSON.stringify(event));
  } catch (error) {
    payload.logger?.warn?.(
      { err: error, eventType: event.type, flightPlanId: event.flightPlanId },
      '[flight-plan-task] failed to publish task event',
    );
  }
};

export const createTaskEvent = (
  partial: Omit<TaskEventEnvelope, 'eventId' | 'happenedAt'>,
): TaskEventEnvelope => ({
  eventId: randomUUID(),
  happenedAt: new Date().toISOString(),
  ...partial,
});
