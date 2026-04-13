import assert from 'node:assert/strict';
import test from 'node:test';

import {
  counterEntriesToMap,
  diffCounterMaps,
  runAuthzTelemetryEvidenceCheck,
  sumDeltaByPrefix,
} from './authz-telemetry-evidence.mjs';

const buildInternalMetricsPayload = ({
  observedEvents,
  allowEvents,
  denyEvents,
  elevatedAllowEvents,
  counters,
}) => ({
  ok: true,
  accessClass: 'internal',
  protections: {
    authorizationDecisions: {
      observedEvents,
      allowEvents,
      denyEvents,
      elevatedAllowEvents,
      counters,
    },
  },
});

test('counterEntriesToMap and diff helpers calculate deltas correctly', () => {
  const before = counterEntriesToMap([
    { key: 'a', value: 2 },
    { key: 'b', value: 4 },
  ]);
  const after = counterEntriesToMap([
    { key: 'a', value: 3 },
    { key: 'c', value: 9 },
  ]);
  const deltas = diffCounterMaps(before, after);

  assert.deepEqual(deltas, [
    { key: 'a', before: 2, after: 3, delta: 1 },
    { key: 'b', before: 4, after: 0, delta: -4 },
    { key: 'c', before: 0, after: 9, delta: 9 },
  ]);
  assert.equal(sumDeltaByPrefix(deltas, 'a'), 1);
  assert.equal(sumDeltaByPrefix(deltas, 'z'), 0);
});

test('runAuthzTelemetryEvidenceCheck succeeds when denied and elevated deltas are observed', async () => {
  const calls = [];
  const fetchMock = async (url, init = {}) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.toString(), init });
    const authHeader = init.headers?.authorization;
    const viewHeader = init.headers?.['x-admin-view-enabled'];

    if (calls.length === 1) {
      assert.equal(parsed.pathname, '/api/ship-status/metrics');
      assert.equal(parsed.searchParams.get('scope'), 'internal');
      assert.equal(viewHeader, 'false');
      assert.equal(authHeader, 'Bearer captain-token');
      return new Response(
        JSON.stringify(
          buildInternalMetricsPayload({
            observedEvents: 20,
            allowEvents: 8,
            denyEvents: 12,
            elevatedAllowEvents: 2,
            counters: [
              { key: 'adminReadAllContent:deny:deny_ineligible_role', value: 3 },
              { key: 'adminReadAllContent:allow:allow_admin_mode_enabled', value: 2 },
            ],
          }),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (calls.length === 2) {
      assert.equal(parsed.pathname, '/api/ship-status/metrics');
      assert.equal(parsed.searchParams.get('scope'), 'internal');
      assert.equal(viewHeader, 'true');
      assert.equal(authHeader, undefined);
      return new Response(JSON.stringify({ ok: false, error: 'Authentication required for internal metrics scope.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (calls.length === 3) {
      assert.equal(parsed.pathname, '/api/ship-status/metrics');
      assert.equal(parsed.searchParams.get('scope'), 'internal');
      assert.equal(viewHeader, 'true');
      assert.equal(authHeader, 'Bearer captain-token');
      return new Response(
        JSON.stringify(
          buildInternalMetricsPayload({
            observedEvents: 21,
            allowEvents: 9,
            denyEvents: 12,
            elevatedAllowEvents: 3,
            counters: [
              { key: 'adminReadAllContent:deny:deny_ineligible_role', value: 3 },
              { key: 'adminReadAllContent:allow:allow_admin_mode_enabled', value: 3 },
            ],
          }),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify(
        buildInternalMetricsPayload({
          observedEvents: 22,
          allowEvents: 9,
          denyEvents: 13,
          elevatedAllowEvents: 3,
          counters: [
            { key: 'adminReadAllContent:deny:deny_ineligible_role', value: 4 },
            { key: 'adminReadAllContent:allow:allow_admin_mode_enabled', value: 3 },
          ],
        }),
      ),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const result = await runAuthzTelemetryEvidenceCheck({
    baseUrl: 'https://astralpirates.com',
    token: 'captain-token',
    fetchImpl: fetchMock,
    timeoutMs: 5000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.telemetry.deltas.denyEvents, 1);
  assert.equal(result.telemetry.deltas.elevatedAllowEvents, 1);
  assert.equal(result.telemetry.deltas.deniedReasonDelta, 1);
  assert.equal(result.telemetry.deltas.elevatedAllowReasonDelta, 1);
  assert.equal(calls.length, 4);
});

test('runAuthzTelemetryEvidenceCheck can resolve token via login fallback', async () => {
  const calls = [];
  const fetchMock = async (url, init = {}) => {
    calls.push({ url, init });
    const parsed = new URL(url);

    if (parsed.pathname === '/api/auth/login') {
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body);
      assert.equal(body.email, 'captain@example.com');
      assert.equal(body.password, 'secret');
      return new Response(JSON.stringify({ token: 'login-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (calls.length === 2) {
      return new Response(
        JSON.stringify(
          buildInternalMetricsPayload({
            observedEvents: 1,
            allowEvents: 1,
            denyEvents: 0,
            elevatedAllowEvents: 0,
            counters: [],
          }),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (calls.length === 3) {
      return new Response(JSON.stringify({ ok: false, error: 'Authentication required for internal metrics scope.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (calls.length === 4) {
      return new Response(
        JSON.stringify(
          buildInternalMetricsPayload({
            observedEvents: 2,
            allowEvents: 2,
            denyEvents: 0,
            elevatedAllowEvents: 1,
            counters: [{ key: 'adminReadAllContent:allow:allow_admin_mode_enabled', value: 1 }],
          }),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify(
        buildInternalMetricsPayload({
          observedEvents: 3,
          allowEvents: 2,
          denyEvents: 1,
          elevatedAllowEvents: 1,
          counters: [
            { key: 'adminReadAllContent:allow:allow_admin_mode_enabled', value: 1 },
            { key: 'adminReadAllContent:deny:deny_ineligible_role', value: 1 },
          ],
        }),
      ),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const result = await runAuthzTelemetryEvidenceCheck({
    baseUrl: 'https://astralpirates.com',
    email: 'captain@example.com',
    password: 'secret',
    fetchImpl: fetchMock,
    timeoutMs: 5000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.telemetry.deltas.denyEvents, 1);
  assert.equal(result.telemetry.deltas.elevatedAllowEvents, 1);
});

test('runAuthzTelemetryEvidenceCheck retries via login when provided token is unauthorized', async () => {
  const calls = [];
  const fetchMock = async (url, init = {}) => {
    const parsed = new URL(url);
    calls.push({ url: parsed.toString(), init });

    if (parsed.pathname === '/api/ship-status/metrics' && calls.length === 1) {
      assert.equal(init.headers?.authorization, 'Bearer stale-token');
      return new Response(JSON.stringify({ ok: false, error: 'Authentication required for internal metrics scope.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (parsed.pathname === '/api/auth/login') {
      const body = JSON.parse(init.body);
      assert.equal(body.email, 'captain@example.com');
      assert.equal(body.password, 'secret');
      return new Response(JSON.stringify({ token: 'fresh-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (parsed.pathname === '/api/ship-status/metrics' && calls.length === 3) {
      assert.equal(init.headers?.authorization, 'Bearer fresh-token');
      assert.equal(init.headers?.['x-admin-view-enabled'], 'false');
      return new Response(
        JSON.stringify(
          buildInternalMetricsPayload({
            observedEvents: 10,
            allowEvents: 4,
            denyEvents: 6,
            elevatedAllowEvents: 1,
            counters: [
              { key: 'adminReadAllContent:deny:deny_ineligible_role', value: 2 },
              { key: 'adminReadAllContent:allow:allow_admin_mode_enabled', value: 1 },
            ],
          }),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    if (parsed.pathname === '/api/ship-status/metrics' && calls.length === 4) {
      assert.equal(init.headers?.authorization, undefined);
      assert.equal(init.headers?.['x-admin-view-enabled'], 'true');
      return new Response(JSON.stringify({ ok: false, error: 'Authentication required for internal metrics scope.' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    if (parsed.pathname === '/api/ship-status/metrics' && calls.length === 5) {
      assert.equal(init.headers?.authorization, 'Bearer fresh-token');
      assert.equal(init.headers?.['x-admin-view-enabled'], 'true');
      return new Response(
        JSON.stringify(
          buildInternalMetricsPayload({
            observedEvents: 11,
            allowEvents: 5,
            denyEvents: 6,
            elevatedAllowEvents: 2,
            counters: [
              { key: 'adminReadAllContent:deny:deny_ineligible_role', value: 2 },
              { key: 'adminReadAllContent:allow:allow_admin_mode_enabled', value: 2 },
            ],
          }),
        ),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }

    assert.equal(parsed.pathname, '/api/ship-status/metrics');
    assert.equal(init.headers?.authorization, 'Bearer fresh-token');
    assert.equal(init.headers?.['x-admin-view-enabled'], 'false');
    return new Response(
      JSON.stringify(
        buildInternalMetricsPayload({
          observedEvents: 12,
          allowEvents: 5,
          denyEvents: 7,
          elevatedAllowEvents: 2,
          counters: [
            { key: 'adminReadAllContent:deny:deny_ineligible_role', value: 3 },
            { key: 'adminReadAllContent:allow:allow_admin_mode_enabled', value: 2 },
          ],
        }),
      ),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  const result = await runAuthzTelemetryEvidenceCheck({
    baseUrl: 'https://astralpirates.com',
    token: 'stale-token',
    email: 'captain@example.com',
    password: 'secret',
    fetchImpl: fetchMock,
    timeoutMs: 5000,
  });

  assert.equal(result.ok, true);
  assert.equal(result.telemetry.deltas.denyEvents, 1);
  assert.equal(result.telemetry.deltas.elevatedAllowEvents, 1);
  assert.equal(result.telemetry.deltas.deniedReasonDelta, 1);
  assert.equal(result.telemetry.deltas.elevatedAllowReasonDelta, 1);
});
