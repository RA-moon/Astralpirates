import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatWeeklySummaryMessage,
  resolveWeeklySummaryWindow,
} from './lib/weekly-website-summary.mjs';

test('resolveWeeklySummaryWindow defaults to previous full Monday-to-Monday UTC window', () => {
  const { start, end } = resolveWeeklySummaryWindow({
    now: new Date('2026-04-01T15:45:00.000Z'), // Wednesday
  });

  assert.equal(start.toISOString(), '2026-03-23T00:00:00.000Z');
  assert.equal(end.toISOString(), '2026-03-30T00:00:00.000Z');
});

test('resolveWeeklySummaryWindow accepts a valid custom ISO window', () => {
  const { start, end } = resolveWeeklySummaryWindow({
    start: '2026-03-16T00:00:00.000Z',
    end: '2026-03-23T00:00:00.000Z',
  });

  assert.equal(start.toISOString(), '2026-03-16T00:00:00.000Z');
  assert.equal(end.toISOString(), '2026-03-23T00:00:00.000Z');
});

test('resolveWeeklySummaryWindow rejects partial custom window input', () => {
  assert.throws(
    () =>
      resolveWeeklySummaryWindow({
        start: '2026-03-16T00:00:00.000Z',
      }),
    /Both --start and --end must be provided together/i,
  );
});

test('resolveWeeklySummaryWindow rejects invalid custom ISO values', () => {
  assert.throws(
    () =>
      resolveWeeklySummaryWindow({
        start: 'not-a-date',
        end: '2026-03-23T00:00:00.000Z',
      }),
    /invalid --start or --end timestamp/i,
  );
});

test('resolveWeeklySummaryWindow rejects non-increasing windows', () => {
  assert.throws(
    () =>
      resolveWeeklySummaryWindow({
        start: '2026-03-23T00:00:00.000Z',
        end: '2026-03-23T00:00:00.000Z',
      }),
    /Start must be before end for a custom window/i,
  );
});

test('formatWeeklySummaryMessage renders totals and signed deltas', () => {
  const message = formatWeeklySummaryMessage({
    startIso: '2026-03-23T00:00:00.000Z',
    endIso: '2026-03-30T00:00:00.000Z',
    totals: { users: 1234, flightPlans: 420, logs: 50 },
    deltas: { users: 34, flightPlans: -2, logs: 0 },
    activity: { activeUsers: 9, delta: -1 },
    planningLines: ['Planning updates: none (last week)'],
    sourceBaseUrl: 'https://astralpirates.com',
  });

  assert.match(message, /^Weekly Summary \(2026-03-23 → 2026-03-30 UTC\)/m);
  assert.match(message, /Users: 1,234 \(\+34 vs prev\)/);
  assert.match(message, /Active crew: 9 \(-1 vs prev\)/);
  assert.match(message, /Flight plans: 420 \(-2 vs prev\)/);
  assert.match(message, /Logs: 50 \(\+0 vs prev\)/);
  assert.match(message, /Planning updates: none \(last week\)/);
  assert.match(message, /Source: https:\/\/astralpirates\.com/);
});

