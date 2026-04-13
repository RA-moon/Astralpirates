import type { NextRequest } from 'next/server';

import { authenticateRequest } from '../../../_lib/auth';
import { recordAuthorizationDecision } from '../../../_lib/authorizationDecisionTelemetry';
import { corsEmpty, corsJson } from '../../../_lib/cors';
import { normaliseId } from '../../../_lib/flightPlanMembers';
import {
  applyFlightPlanLifecycleTransition,
  canManageFlightPlanLifecycle,
  findFlightPlanBySlug,
  resolveFlightPlanLifecycleStatus,
  sanitizeFlightPlanSlug,
  validateReopenRequest,
} from '../../../_lib/flightPlanLifecycle';

const METHODS = 'OPTIONS,POST';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ slug?: string }> },
) {
  const auth = await authenticateRequest(req);
  if (!auth.user) {
    return corsJson(req, { error: 'Authentication required.' }, { status: 401 }, METHODS);
  }

  const resolvedParams = await context.params;
  const slug = sanitizeFlightPlanSlug(resolvedParams?.slug);
  if (!slug) {
    return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
  }

  let payloadBody: { statusReason?: unknown };
  try {
    payloadBody = (await req.json()) as { statusReason?: unknown };
  } catch {
    return corsJson(req, { error: 'Invalid JSON payload.' }, { status: 400 }, METHODS);
  }

  try {
    const plan = await findFlightPlanBySlug({
      payload: auth.payload,
      slug,
      depth: 0,
    });
    if (!plan) {
      return corsJson(req, { error: 'Flight plan not found.' }, { status: 404 }, METHODS);
    }

    const flightPlanId = normaliseId(plan.id);
    if (flightPlanId == null) {
      return corsJson(
        req,
        { error: 'Unable to resolve flight plan identifier.' },
        { status: 500 },
        METHODS,
      );
    }

    const ownerId = normaliseId(plan.owner);
    const lifecycleAllowed = canManageFlightPlanLifecycle({
      ownerId,
      user: auth.user,
      adminMode: auth.adminMode,
    });
    recordAuthorizationDecision({
      payload: auth.payload,
      capability: 'manageFlightPlanLifecycle',
      allowed: lifecycleAllowed,
      reasonCode: lifecycleAllowed
        ? 'allow_owner_or_sailing_master'
        : 'deny_owner_or_sailing_master_required',
      actorId: auth.user.id,
      actorRole: auth.user.role,
      resourceType: 'flight-plan',
      resourceId: flightPlanId,
      resourceSlug: slug,
    });
    if (!lifecycleAllowed) {
      auth.payload.logger?.warn?.(
        {
          event: 'flight_plan_reopen_permission_denied',
          flightPlanId,
          slug,
          actorId: normaliseId(auth.user.id),
          actorRole: auth.user.role,
        },
        'Denied flight-plan reopen due to lifecycle permission gate',
      );
      return corsJson(
        req,
        { error: 'Only the captain or sailing-master+ can reopen missions.' },
        { status: 403 },
        METHODS,
      );
    }

    const currentStatus = resolveFlightPlanLifecycleStatus(plan.status);
    const reopenValidation = validateReopenRequest({
      currentStatus,
      reason: payloadBody.statusReason,
    });

    if (!reopenValidation.ok) {
      auth.payload.logger?.warn?.(
        {
          event: 'flight_plan_reopen_rejected',
          flightPlanId,
          slug,
          actorId: normaliseId(auth.user.id),
          fromStatus: currentStatus,
          reason: reopenValidation.error,
        },
        'Rejected flight-plan reopen request',
      );
      return corsJson(req, { error: reopenValidation.error }, { status: 400 }, METHODS);
    }

    const transitionResult = await applyFlightPlanLifecycleTransition({
      payload: auth.payload,
      user: auth.user,
      plan,
      flightPlanId,
      fromStatus: currentStatus,
      toStatus: reopenValidation.toStatus,
      reason: reopenValidation.reason,
      actionType: reopenValidation.actionType,
    });

    auth.payload.logger?.info?.(
      {
        event: 'flight_plan_reopen',
        flightPlanId,
        slug,
        actorId: normaliseId(auth.user.id),
        fromStatus: currentStatus,
        toStatus: reopenValidation.toStatus,
      },
      'Flight-plan reopened',
    );

    return corsJson(
      req,
      { plan: transitionResult.plan },
      {},
      METHODS,
    );
  } catch (error) {
    auth.payload.logger?.error?.(
      { err: error, slug, actorId: normaliseId(auth.user.id) },
      'Failed to reopen flight-plan lifecycle status',
    );
    return corsJson(
      req,
      { error: 'Unable to reopen mission lifecycle status.' },
      { status: 500 },
      METHODS,
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  return corsEmpty(req, METHODS);
}
