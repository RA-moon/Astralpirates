import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';

import { createPlansSnapshotPayload, writePlansSnapshotPayload } from './plans-snapshot';

test('createPlansSnapshotPayload preserves explicit generatedAt', () => {
  const payload = createPlansSnapshotPayload([{ id: 'p1' }], '2026-04-09T00:00:00.000Z');

  assert.equal(payload.generatedAt, '2026-04-09T00:00:00.000Z');
  assert.deepEqual(payload.plans, [{ id: 'p1' }]);
});

test('createPlansSnapshotPayload defaults generatedAt to an ISO timestamp', () => {
  const payload = createPlansSnapshotPayload([{ id: 'p2' }]);

  assert.match(payload.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(payload.plans, [{ id: 'p2' }]);
});

test('writePlansSnapshotPayload writes identical JSON to all outputs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'plans-snapshot-'));
  const outputA = path.join(root, 'frontend', 'app', 'generated', 'plans.json');
  const outputB = path.join(root, 'cms', 'seed', 'data', 'plans.json');
  const payload = createPlansSnapshotPayload(
    [{ id: 'streamline', status: 'active' }],
    '2026-04-09T01:02:03.000Z',
  );

  try {
    await writePlansSnapshotPayload(payload, [outputA, outputB]);

    const [a, b] = await Promise.all([readFile(outputA, 'utf8'), readFile(outputB, 'utf8')]);
    assert.equal(a, b);
    const parsed = JSON.parse(a);
    assert.equal(parsed.generatedAt, '2026-04-09T01:02:03.000Z');
    assert.deepEqual(parsed.plans, [{ id: 'streamline', status: 'active' }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
