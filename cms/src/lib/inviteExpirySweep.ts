import type { Payload } from 'payload';

import {
  clearInviteState,
  deriveInviteTokenIdentifiers,
  resolveElsaBalance,
} from '../../app/api/_lib/invite';
import { revokeRegistrationTokens } from '../../app/api/_lib/registrationTokens';
import { refundElsa, spendElsa } from '../services/elsaLedger';

const DEFAULT_PAGE_SIZE = 100;

const parseInviteTimestamp = (value: unknown): number => {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : NaN;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }
  return NaN;
};

export type InviteExpirySummary = {
  checked: number;
  eligible: number;
  expired: number;
  tokenCleanupFailures: number;
};

export const runInviteExpirySweep = async (
  instance: Payload,
  options?: { pageSize?: number; logger?: Payload['logger'] | Console },
): Promise<InviteExpirySummary> => {
  const summary: InviteExpirySummary = {
    checked: 0,
    eligible: 0,
    expired: 0,
    tokenCleanupFailures: 0,
  };

  const pageSize = options?.pageSize ?? DEFAULT_PAGE_SIZE;
  const logger = options?.logger ?? instance.logger ?? console;

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  let page = 1;

  while (true) {
    const result = await instance.find({
      collection: 'users',
      where: {
        and: [
          { 'invite.expiresAt': { less_than_equal: nowIso } },
          { 'invite.email': { exists: true } },
          {
            or: [
              { 'invite.redeemedAt': { exists: false } },
              { 'invite.redeemedAt': { equals: null } },
            ],
          },
        ],
      },
      depth: 0,
      page,
      limit: pageSize,
      overrideAccess: true,
    });

    if (result.docs.length === 0) break;

    for (const doc of result.docs) {
      summary.checked += 1;
      const invite = (doc as any)?.invite;
      if (!invite || typeof invite !== 'object') continue;

      const expiresAtMs = parseInviteTimestamp((invite as any)?.expiresAt);
      if (!Number.isFinite(expiresAtMs) || expiresAtMs > nowMs) {
        continue;
      }

      summary.eligible += 1;

      const purposeRaw = (invite as any)?.purpose;
      const purpose =
        typeof purposeRaw === 'string' && purposeRaw.length > 0 ? purposeRaw : 'recruit';
      const [tokenId, tokenValue] = deriveInviteTokenIdentifiers(invite);
      if (tokenId != null || tokenValue) {
        try {
          await revokeRegistrationTokens(
            instance as unknown as Payload,
            {
              tokenId,
              token: tokenValue,
              purposes: [purpose === 'password_reset' ? 'password_reset' : 'recruit'],
              onlyUnused: false,
              limit: 10,
            },
            {
              warnContext: { userId: doc.id },
              warnLabel: 'Failed to remove expired registration token',
            },
          );
        } catch (error) {
          summary.tokenCleanupFailures += 1;
          const warn = logger.warn as ((...args: unknown[]) => void) | undefined;
          if (warn) {
            warn({ err: error, userId: doc.id }, 'Failed to remove expired registration token');
          }
        }
      }
      const shouldRefundElsa = purpose === 'recruit';
      let refundResult: Awaited<ReturnType<typeof refundElsa>> | null = null;

      try {
        if (shouldRefundElsa) {
          refundResult = await refundElsa({
            payload: instance as unknown as Payload,
            userId: doc.id as number,
            amount: 1,
            type: 'refund',
            metadata: {
              reason: 'invite_expiry',
              tokenId,
              tokenValue,
            },
            idempotencyKey:
              tokenId != null
                ? `invite-expiry:${tokenId}`
                : tokenValue
                  ? `invite-expiry:${tokenValue}`
                  : `invite-expiry:${doc.id}`,
          });
        }

        const updateData: Record<string, unknown> = {
          invite: clearInviteState(),
        };
        if (refundResult) {
          updateData.elsaTokens = refundResult.balanceAfter;
        }
        await instance.update({
          collection: 'users',
          id: doc.id,
          data: updateData,
          overrideAccess: true,
        });
        summary.expired += 1;
      } catch (error) {
        if (refundResult?.applied) {
          try {
            await spendElsa({
              payload: instance as unknown as Payload,
              userId: doc.id as number,
              amount: 1,
              type: 'spend',
              metadata: {
                reason: 'invite_expiry_rollback',
                tokenId,
                tokenValue,
              },
              idempotencyKey:
                tokenId != null
                  ? `invite-expiry-revert:${tokenId}`
                  : tokenValue
                    ? `invite-expiry-revert:${tokenValue}`
                    : `invite-expiry-revert:${doc.id}`,
            });
          } catch (rollbackError) {
            const logError = logger.error as ((...args: unknown[]) => void) | undefined;
            if (logError) {
              logError(
                { err: rollbackError, userId: doc.id },
                'Failed to rollback E.L.S.A. after invite expiry error',
              );
            }
          }
        }
        const logError = logger.error as ((...args: unknown[]) => void) | undefined;
        if (logError) {
          logError({ err: error, userId: doc.id }, 'Failed to expire invite for user');
        }
      }
    }

    if (result.docs.length < pageSize) break;
    page += 1;
  }

  return summary;
};
