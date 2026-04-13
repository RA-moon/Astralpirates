import type { NextRequest } from 'next/server';
import { createLocalReq } from 'payload';
import {
  ADMIN_MODE_HEADERS,
  parseAdminModeFlag,
  resolveEffectiveAdminMode,
  type EffectiveAdminMode,
} from '@astralpirates/shared/adminMode';

import type { User } from '@/payload-types';
import { getPayloadInstance } from '@/app/lib/payload';
import { recordAuthorizationDecision } from './authorizationDecisionTelemetry';
import { applyAdminModeRollout, type AdminModeRollout } from './adminModeRollout';

export type AuthContext = {
  payload: Awaited<ReturnType<typeof getPayloadInstance>>;
  user: User | null;
  adminMode: EffectiveAdminMode;
};

const ADMIN_MODE_COOKIE_KEYS = Object.freeze({
  view: 'astral_admin_view',
  edit: 'astral_admin_edit',
});

const normalisePayloadAuthHeaders = (headers: Headers): Headers => {
  const normalised = new Headers(headers);
  const authHeader = normalised.get('Authorization');
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) {
      normalised.set('Authorization', `JWT ${match[1].trim()}`);
    }
  }
  return normalised;
};

const buildPayloadAuthRequest = (headers: Headers) => ({
  headers,
  req: {
    headers: Object.fromEntries(headers.entries()),
  } as any,
  canSetHeaders: false as const,
});

const stripAuthorizationHeader = (headers: Headers): Headers => {
  const next = new Headers(headers);
  next.delete('Authorization');
  return next;
};

const getCookieValue = (req: NextRequest, key: string): string | null => {
  const cookieStore = (req as any).cookies;
  if (cookieStore && typeof cookieStore.get === 'function') {
    const entry = cookieStore.get(key);
    if (typeof entry === 'string') {
      return entry;
    }
    if (entry && typeof entry === 'object' && 'value' in entry) {
      const value = (entry as { value?: unknown }).value;
      if (typeof value === 'string') {
        return value;
      }
    }
  }

  const cookieHeader = req.headers.get('cookie');
  if (!cookieHeader) {
    return null;
  }

  const cookiePairs = cookieHeader.split(';');
  for (const pair of cookiePairs) {
    const [rawName, ...rawValueParts] = pair.trim().split('=');
    if (rawName !== key || rawValueParts.length === 0) {
      continue;
    }
    return rawValueParts.join('=');
  }

  return null;
};

export const resolveAdminModeRequestInputs = ({
  requestedAdminViewSignal,
  requestedAdminEditSignal,
  persistedPreferenceMode,
}: {
  requestedAdminViewSignal: string | null;
  requestedAdminEditSignal: string | null;
  persistedPreferenceMode?: Pick<EffectiveAdminMode, 'adminViewEnabled' | 'adminEditEnabled'> | null;
}): { adminViewRequested: unknown; adminEditRequested: unknown } => ({
  adminViewRequested: requestedAdminViewSignal ?? persistedPreferenceMode?.adminViewEnabled ?? false,
  adminEditRequested: requestedAdminEditSignal ?? persistedPreferenceMode?.adminEditEnabled ?? false,
});

const recordAdminModeAudit = ({
  payload,
  path,
  userId,
  role,
  requestedAdminView,
  requestedAdminEdit,
  effectiveMode,
  rollout,
  downgraded,
}: {
  payload: Awaited<ReturnType<typeof getPayloadInstance>>;
  path: string;
  userId: string | number | null;
  role: string | null;
  requestedAdminView: string | null;
  requestedAdminEdit: string | null;
  effectiveMode: EffectiveAdminMode;
  rollout: AdminModeRollout;
  downgraded: boolean;
}) => {
  const requestedViewEnabled = parseAdminModeFlag(requestedAdminView);
  const requestedEditEnabled = parseAdminModeFlag(requestedAdminEdit);

  if (requestedViewEnabled && !effectiveMode.adminViewEnabled) {
    const reason = rollout.shadowMode
      ? 'shadow_mode'
      : !rollout.adminViewEnabled
        ? 'rollout_disabled'
        : effectiveMode.eligibility.canUseAdminView
          ? 'admin_view_disabled'
          : 'ineligible_role';
    recordAuthorizationDecision({
      payload,
      capability: 'adminReadAllContent',
      allowed: false,
      reasonCode: `deny_${reason}`,
      actorId: userId,
      actorRole: role,
      resourceType: 'request',
      resourceId: null,
      resourceSlug: path,
    });
    payload.logger.warn(
      {
        event: 'admin_mode_request',
        capability: 'adminReadAllContent',
        decision: 'deny',
        reason,
        userId,
        role,
        path,
      },
      '[auth] denied admin view request',
    );
  }

  if (requestedEditEnabled && !effectiveMode.adminEditEnabled) {
    const reason = rollout.shadowMode
      ? 'shadow_mode'
      : !rollout.adminViewEnabled || !rollout.adminEditEnabled
        ? 'rollout_disabled'
        : effectiveMode.eligibility.canUseAdminEdit
          ? effectiveMode.adminViewEnabled
            ? 'admin_edit_disabled'
            : 'admin_view_required'
          : 'ineligible_role';
    recordAuthorizationDecision({
      payload,
      capability: 'adminEditAllContent',
      allowed: false,
      reasonCode: `deny_${reason}`,
      actorId: userId,
      actorRole: role,
      resourceType: 'request',
      resourceId: null,
      resourceSlug: path,
    });
    payload.logger.warn(
      {
        event: 'admin_mode_request',
        capability: 'adminEditAllContent',
        decision: 'deny',
        reason,
        userId,
        role,
        path,
      },
      '[auth] denied admin edit request',
    );
  }

  if (effectiveMode.adminViewEnabled || effectiveMode.adminEditEnabled) {
    const capability = effectiveMode.adminEditEnabled
      ? 'adminEditAllContent'
      : 'adminReadAllContent';
    recordAuthorizationDecision({
      payload,
      capability,
      allowed: true,
      reasonCode: 'allow_admin_mode_enabled',
      actorId: userId,
      actorRole: role,
      resourceType: 'request',
      resourceId: null,
      resourceSlug: path,
      metadata: {
        adminViewEnabled: effectiveMode.adminViewEnabled,
        adminEditEnabled: effectiveMode.adminEditEnabled,
      },
    });
    payload.logger.info?.(
      {
        event: 'admin_mode_request',
        capability,
        decision: 'allow',
        userId,
        role,
        path,
        adminViewEnabled: effectiveMode.adminViewEnabled,
        adminEditEnabled: effectiveMode.adminEditEnabled,
        downgraded,
        rollout,
      },
      '[auth] elevated admin mode granted',
    );
    return;
  }

  if (downgraded) {
    recordAuthorizationDecision({
      payload,
      capability: 'adminReadAllContent',
      allowed: false,
      reasonCode: 'deny_shadow_mode_downgrade',
      actorId: userId,
      actorRole: role,
      resourceType: 'request',
      resourceId: null,
      resourceSlug: path,
    });
    payload.logger.info?.(
      {
        event: 'admin_mode_request',
        capability: 'adminReadAllContent',
        decision: 'shadow',
        userId,
        role,
        path,
        adminViewEnabled: effectiveMode.adminViewEnabled,
        adminEditEnabled: effectiveMode.adminEditEnabled,
        downgraded,
        rollout,
      },
      '[auth] admin mode request downgraded by rollout policy',
    );
  }
};

export const authenticateRequest = async (req: NextRequest): Promise<AuthContext> => {
  const payload = await getPayloadInstance();
  const requestPath = req.nextUrl?.pathname ?? 'unknown';
  const authHeaders = normalisePayloadAuthHeaders(req.headers);
  const requestedAdminViewSignal =
    req.headers.get(ADMIN_MODE_HEADERS.view) ??
    getCookieValue(req, ADMIN_MODE_COOKIE_KEYS.view) ??
    null;
  const requestedAdminEditSignal =
    req.headers.get(ADMIN_MODE_HEADERS.edit) ??
    getCookieValue(req, ADMIN_MODE_COOKIE_KEYS.edit) ??
    null;

  let authResult: { user?: { id: number | string } | null } = { user: null };
  try {
    authResult = await payload.auth(buildPayloadAuthRequest(authHeaders));
  } catch (error) {
      payload.logger.warn(
      { err: error, path: requestPath },
      '[auth] bearer auth failed before cookie fallback',
    );
  }

  // If a stale/invalid bearer token is sent alongside a valid auth cookie, Payload may
  // reject the request before considering the cookie. Retry once with cookie-only headers
  // so authenticated users don't lose upload access when local bearer state drifts.
  if (!authResult.user && authHeaders.has('Authorization') && authHeaders.has('Cookie')) {
    try {
      const cookieHeaders = stripAuthorizationHeader(authHeaders);
      authResult = await payload.auth(buildPayloadAuthRequest(cookieHeaders));
    } catch (error) {
      payload.logger.warn(
        { err: error, path: requestPath },
        '[auth] cookie fallback auth failed after bearer rejection',
      );
    }
  }

  if (!authResult.user) {
    const baseAdminMode = resolveEffectiveAdminMode({
      role: null,
      adminViewRequested: requestedAdminViewSignal,
      adminEditRequested: requestedAdminEditSignal,
    });
    const rolloutResult = applyAdminModeRollout(baseAdminMode);
    recordAdminModeAudit({
      payload,
      path: requestPath,
      userId: null,
      role: null,
      requestedAdminView: requestedAdminViewSignal,
      requestedAdminEdit: requestedAdminEditSignal,
      effectiveMode: rolloutResult.effectiveMode,
      rollout: rolloutResult.rollout,
      downgraded: rolloutResult.downgraded,
    });
    return {
      payload,
      user: null,
      adminMode: rolloutResult.effectiveMode,
    };
  }

  try {
    const userDoc = await payload.findByID({
      collection: 'users',
      id: authResult.user.id,
      depth: 0,
      overrideAccess: true,
    });
    const persistedPreferenceMode = resolveEffectiveAdminMode({
      role: userDoc?.role ?? null,
      adminViewRequested: (userDoc as any)?.adminModeViewPreference,
      adminEditRequested: (userDoc as any)?.adminModeEditPreference,
    });
    const requestedAdminModeInputs = resolveAdminModeRequestInputs({
      requestedAdminViewSignal,
      requestedAdminEditSignal,
      persistedPreferenceMode,
    });
    const baseAdminMode = resolveEffectiveAdminMode({
      role: userDoc?.role ?? null,
      ...requestedAdminModeInputs,
    });
    const rolloutResult = applyAdminModeRollout(baseAdminMode);
    recordAdminModeAudit({
      payload,
      path: requestPath,
      userId: userDoc?.id ?? null,
      role: typeof userDoc?.role === 'string' ? userDoc.role : null,
      requestedAdminView: requestedAdminViewSignal,
      requestedAdminEdit: requestedAdminEditSignal,
      effectiveMode: rolloutResult.effectiveMode,
      rollout: rolloutResult.rollout,
      downgraded: rolloutResult.downgraded,
    });
    return {
      payload,
      user: userDoc,
      adminMode: rolloutResult.effectiveMode,
    };
  } catch (error) {
    payload.logger.warn({ err: error, userId: authResult.user.id }, 'Failed to resolve authenticated user');
    const baseAdminMode = resolveEffectiveAdminMode({
      role: null,
      adminViewRequested: requestedAdminViewSignal,
      adminEditRequested: requestedAdminEditSignal,
    });
    const rolloutResult = applyAdminModeRollout(baseAdminMode);
    recordAdminModeAudit({
      payload,
      path: requestPath,
      userId: authResult.user.id,
      role: null,
      requestedAdminView: requestedAdminViewSignal,
      requestedAdminEdit: requestedAdminEditSignal,
      effectiveMode: rolloutResult.effectiveMode,
      rollout: rolloutResult.rollout,
      downgraded: rolloutResult.downgraded,
    });
    return {
      payload,
      user: null,
      adminMode: rolloutResult.effectiveMode,
    };
  }
};

export const buildRequestForUser = async (
  payload: Awaited<ReturnType<typeof getPayloadInstance>>,
  user: User,
) =>
  createLocalReq(
    {
      user: {
        ...user,
        collection: 'users',
      },
      req: {
        user: {
          ...user,
          collection: 'users',
        },
      },
    },
    payload,
  );
