import type { NextRequest } from 'next/server';

import { authenticateRequest, buildRequestForUser } from '../../_lib/auth';
import { corsEmpty, corsJson } from '../../_lib/cors';
import { clearInviteState, formatInviteState, resolveElsaBalance, resolveRelationId } from '../../_lib/invite';
import { revokeRegistrationTokens } from '../../_lib/registrationTokens';
import { refundElsa, spendElsa } from '@/src/services/elsaLedger';

const METHODS = 'OPTIONS,POST';

export async function POST(req: NextRequest) {
  const { payload, user } = await authenticateRequest(req);
  if (!user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const inviteState = (user as any).invite ?? {};
  const invitePurpose =
    typeof inviteState?.purpose === 'string' ? (inviteState.purpose as string) : 'recruit';
  const redeemed = typeof inviteState?.redeemedAt === 'string' && inviteState.redeemedAt.length > 0;
  const tokenValue = typeof inviteState?.token === 'string' ? inviteState.token : null;
  const tokenId = resolveRelationId(inviteState?.tokenId);

  if (!tokenValue || redeemed) {
    return corsJson(
      req,
      { error: 'No pending invitation to cancel.' },
      { status: 409 },
      METHODS,
    );
  }

  const localReq = await buildRequestForUser(payload, user);

  try {
    await revokeRegistrationTokens(
      payload,
      {
        tokenId,
        token: tokenValue,
        purposes: [invitePurpose === 'password_reset' ? 'password_reset' : 'recruit'],
        onlyUnused: false,
        limit: 5,
      },
      {
        req: localReq,
        warnContext: { inviterId: user.id, tokenId, tokenValue },
        warnLabel: 'Failed to delete invite token during cancellation',
      },
    );
  } catch (error) {
    payload.logger.warn(
      { err: error, inviterId: user.id, tokenId, tokenValue },
      'Failed to delete invite token during cancellation',
    );
  }

  const shouldRefundElsa = invitePurpose === 'recruit';
  let refundResult: Awaited<ReturnType<typeof refundElsa>> | null = null;

  if (shouldRefundElsa) {
    try {
      refundResult = await refundElsa({
        payload,
        userId: user.id,
        amount: 1,
        type: 'refund',
        metadata: {
          reason: 'invite_cancel',
          tokenId,
          tokenValue,
        },
        idempotencyKey:
          tokenId != null
            ? `invite-cancel:${tokenId}`
            : tokenValue
              ? `invite-cancel:${tokenValue}`
              : undefined,
      });
    } catch (error) {
      payload.logger.error(
        { err: error, inviterId: user.id, tokenId, tokenValue },
        'Failed to refund E.L.S.A. while cancelling invite',
      );
      return corsJson(req, { error: 'Unable to cancel invitation.' }, { status: 500 }, METHODS);
    }
  }

  try {
    const updateData: Record<string, unknown> = {
      invite: clearInviteState(),
    };
    if (refundResult) {
      updateData.elsaTokens = refundResult.balanceAfter;
    }

    const updatedUser = await payload.update({
      collection: 'users',
      id: user.id,
      data: updateData,
      req: localReq,
      overrideAccess: true,
    });

    return corsJson(
      req,
      {
        message: 'Invitation cancelled.',
        invite: formatInviteState((updatedUser as any).invite),
        elsaTokens: resolveElsaBalance((updatedUser as any)?.elsaTokens),
      },
      {},
      METHODS,
    );
  } catch (error) {
    if (refundResult?.applied) {
      try {
        await spendElsa({
          payload,
          userId: user.id,
          amount: 1,
          type: 'spend',
          metadata: {
            reason: 'invite_cancel_rollback',
            tokenId,
            tokenValue,
          },
          idempotencyKey:
            tokenId != null
              ? `invite-cancel-revert:${tokenId}`
              : tokenValue
                ? `invite-cancel-revert:${tokenValue}`
                : undefined,
        });
      } catch (rollbackError) {
        payload.logger.error(
          { err: rollbackError, inviterId: user.id, tokenId, tokenValue },
          'Failed to rollback E.L.S.A. after invite cancellation error',
        );
      }
    }
    payload.logger.error({ err: error, inviterId: user.id }, 'Failed to cancel invite');
    return corsJson(req, { error: 'Unable to cancel invitation.' }, { status: 500 }, METHODS);
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
