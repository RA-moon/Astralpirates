import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const WEEKLY_SUMMARY_SCRIPT = resolve(HERE, 'weekly-website-summary.mjs');
const TEST_START = '2026-03-23T00:00:00.000Z';
const TEST_END = '2026-03-30T00:00:00.000Z';

const startJsonServer = async (handler) => {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to determine server address');
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
};

const runWeeklySummary = async ({
  baseUrl,
  slackWebhook,
  slackFailOpen = false,
}) => {
  const child = spawn(
    process.execPath,
    [
      WEEKLY_SUMMARY_SCRIPT,
      '--base',
      baseUrl,
      '--start',
      TEST_START,
      '--end',
      TEST_END,
    ],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        SLACK_WEBHOOK: slackWebhook,
        ...(slackFailOpen ? { SLACK_FAIL_OPEN: 'true' } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const [exitCode] = await once(child, 'close');
  return {
    exitCode: Number(exitCode),
    stdout,
    stderr,
  };
};

const METRICS_PAYLOAD = {
  ok: true,
  generatedAt: '2026-03-30T00:05:00.000Z',
  windows: {
    since24h: { start: '2026-03-29T00:05:00.000Z', end: '2026-03-30T00:05:00.000Z' },
    since7d: { start: '2026-03-23T00:05:00.000Z', end: '2026-03-30T00:05:00.000Z' },
  },
  totals: {
    users: 34,
    logs: 4,
    flightPlans: 6,
  },
  deltas: {
    since24h: { users: 1, logs: 0, flightPlans: 0 },
    since7d: { users: 4, logs: 2, flightPlans: 1 },
  },
  activity: {
    since24h: { activeUsers: 1 },
    since7d: { activeUsers: 3 },
  },
  custom: {
    window: { start: TEST_START, end: TEST_END },
    previousWindow: { start: '2026-03-16T00:00:00.000Z', end: TEST_START },
    counts: { users: 4, logs: 2, flightPlans: 1 },
    previousCounts: { users: 4, logs: 2, flightPlans: 1 },
    deltas: { users: 0, logs: 0, flightPlans: 0 },
    activity: {
      activeUsers: 0,
      previousActiveUsers: 0,
      delta: 0,
    },
  },
};

test('weekly summary posts formatted payload to webhook when webhook succeeds', async () => {
  let postedPayload = null;

  const metrics = await startJsonServer((req, res) => {
    if (req.url?.startsWith('/api/ship-status/metrics')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(METRICS_PAYLOAD));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  const webhook = await startJsonServer(async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('method not allowed');
      return;
    }
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    postedPayload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });

  try {
    const result = await runWeeklySummary({
      baseUrl: metrics.baseUrl,
      slackWebhook: webhook.baseUrl,
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.equal(typeof postedPayload?.text, 'string');
    assert.match(postedPayload.text, /Weekly Summary \(2026-03-23 → 2026-03-30 UTC\)/);
    assert.match(postedPayload.text, /Users: 34 \(\+0 vs prev\)/);
    assert.match(postedPayload.text, new RegExp(`Source: ${metrics.baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    assert.match(result.stdout, /Posted weekly summary to Slack/i);
  } finally {
    metrics.server.close();
    webhook.server.close();
  }
});

test('weekly summary treats 404 no_service as non-fatal when SLACK_FAIL_OPEN=true', async () => {
  const metrics = await startJsonServer((req, res) => {
    if (req.url?.startsWith('/api/ship-status/metrics')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(METRICS_PAYLOAD));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  const webhook = await startJsonServer((_req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('no_service');
  });

  try {
    const result = await runWeeklySummary({
      baseUrl: metrics.baseUrl,
      slackWebhook: webhook.baseUrl,
      slackFailOpen: true,
    });

    assert.equal(result.exitCode, 0, result.stderr);
    assert.match(result.stderr, /ignored: SLACK_FAIL_OPEN=true/i);
  } finally {
    metrics.server.close();
    webhook.server.close();
  }
});

