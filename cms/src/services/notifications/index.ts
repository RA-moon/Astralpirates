import type { Payload } from 'payload';

export type NotificationEvent =
  | 'flight_plan_created'
  | 'flight_plan_invitation_received'
  | 'flight_plan_invitation_accepted'
  | 'flight_plan_membership_promoted'
  | 'flight_plan_task_owner_changed'
  | 'flight_plan_task_assigned'
  | 'flight_plan_task_comment'
  | 'flight_plan_task_mention'
  | 'flight_plan_task_digest';

export type NotificationInput = {
  event: NotificationEvent;
  recipientId: number | string;
  message: string;
  payload: Payload;
  actorId?: number | string | null;
  metadata?: Record<string, unknown> | null;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
};

const normalizeId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const sanitizeString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const cloneMetadata = (metadata: Record<string, unknown> | null | undefined) => {
  if (!metadata) return undefined;
  try {
    return JSON.parse(JSON.stringify(metadata));
  } catch {
    return undefined;
  }
};

export const safeCreateNotification = async ({
  event,
  recipientId,
  message,
  payload,
  actorId,
  metadata,
  ctaUrl,
  ctaLabel,
}: NotificationInput): Promise<void> => {
  const normalizedRecipient = normalizeId(recipientId);
  if (normalizedRecipient == null) {
    payload.logger?.warn?.({ event, recipientId }, '[notifications] invalid recipient identifier');
    return;
  }

  const normalizedActor = normalizeId(actorId ?? null);

  try {
    await payload.create({
      collection: 'notifications',
      data: {
        event,
        recipient: normalizedRecipient,
        actor: normalizedActor ?? undefined,
        message,
        metadata: cloneMetadata(metadata),
        ctaUrl: sanitizeString(ctaUrl),
        ctaLabel: sanitizeString(ctaLabel),
      },
      draft: false,
      overrideAccess: true,
      depth: 0,
    });
  } catch (error) {
    payload.logger?.warn?.(
      { err: error, event, recipientId: normalizedRecipient },
      '[notifications] failed to enqueue notification',
    );
  }
};
