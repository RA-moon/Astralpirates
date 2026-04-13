import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, 'audit-tier1-tier2-governance.mjs');
const fixturesRoot = path.join(__dirname, 'fixtures', 'audit-tier1-tier2-governance');
const TEST_NOW = '2026-04-10T00:00:00Z';

function runAuditJson(root) {
  return execFileSync('node', [scriptPath, '--now', TEST_NOW, '--root', root, '--json'], { encoding: 'utf8' });
}

function runAssertClean(root) {
  return spawnSync('node', [scriptPath, '--now', TEST_NOW, '--root', root, '--assert-clean'], { encoding: 'utf8' });
}

test('audit report contract stays stable for clean fixture input', () => {
  const fixtureRoot = path.join(fixturesRoot, 'clean');
  const stdout = runAuditJson(fixtureRoot);
  const report = JSON.parse(stdout);

  assert.deepEqual(
    Object.keys(report).sort(),
    [
      'details',
      'generatedAt',
      'items',
      'missingRefs',
      'noRefs',
      'noRunLogRefs',
      'nonDeterministicRefs',
      'schemaErrors',
      'unresolvedPlanDocs',
    ].sort(),
  );

  assert.equal(typeof report.generatedAt, 'string');
  assert.equal(report.items, 1);
  assert.equal(report.missingRefs, 0);
  assert.equal(report.noRunLogRefs, 0);
  assert.equal(report.noRefs, 0);
  assert.equal(report.nonDeterministicRefs, 0);
  assert.equal(report.unresolvedPlanDocs, 0);
  assert.equal(report.schemaErrors, 0);

  assert.equal(Array.isArray(report.details.missingRefPlans), true);
  assert.equal(Array.isArray(report.details.noRunLogPlans), true);
  assert.equal(Array.isArray(report.details.noRefPlans), true);
  assert.equal(Array.isArray(report.details.nonDeterministicPlans), true);
  assert.equal(Array.isArray(report.details.unresolvedPlanDocs), true);
  assert.equal(Array.isArray(report.details.schemaErrors), true);
});

test('assert-clean fails on fixture with missing deterministic refs', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-missing-ref');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Missing refs in plans: T1\.02\(1\)/);
});

test('json report includes exact missing deterministic ref paths per plan', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-missing-ref');
  const stdout = runAuditJson(fixtureRoot);
  const report = JSON.parse(stdout);

  assert.equal(report.missingRefs, 1);
  assert.equal(report.details.missingRefPlans.length, 1);
  assert.deepEqual(report.details.missingRefPlans[0], {
    itemId: 'T1.02',
    planId: 'fixture-broken-plan',
    docPath: 'docs/planning/fixture-broken-plan.md',
    missing: 1,
    refs: ['docs/planning/does-not-exist.md'],
  });
});

test('assert-clean fails on fixture with shipped plan missing run-log refs', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-no-runlog');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Shipped plans without run-log refs: T1\.03/);
});

test('assert-clean fails on fixture with no deterministic refs', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-no-refs');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Plans without deterministic refs: T1\.04/);
});

test('assert-clean fails on fixture with unresolved plan doc path', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-unresolved-plan-doc');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Unresolved plan docs: T1\.05:docs\/planning\/does-not-exist\.md/);
});

test('assert-clean fails on fixture with non-deterministic refs', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-nondeterministic');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Plans with non-deterministic refs: T1\.06\(1\)/);
});

test('assert-clean passes when roadmap/plans include additive schema fields', () => {
  const fixtureRoot = path.join(fixturesRoot, 'schema-extra-fields');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.equal(run.status, 0, combinedOutput);
});

test('assert-clean fails on fixture with missing/wrong required schema fields', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-schema');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(combinedOutput, /roadmap\.tiers\[0\]\.items must be an array\./);
  assert.match(combinedOutput, /plans\[0\]\.path must be a non-empty string\./);
});

test('assert-clean fails on fixture with plans schema missing required cloudStatus metadata', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-schema-missing-cloudstatus');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(combinedOutput, /plans\[0\]\.cloudStatus must be a non-empty string\./);
});

test('assert-clean fails on fixture with plans schema invalid status enum value', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-schema-invalid-status');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /plans\[0\]\.status \(done\) must be one of: queued, active, shipped, tested, canceled\./,
  );
});

test('assert-clean fails on fixture with plans schema invalid tier enum value', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-schema-invalid-tier');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /plans\[0\]\.tier \(tierX\) must be one of: tier1, tier2, tier3, tier4, tier5\./,
  );
});

test('assert-clean fails on fixture with duplicate plans schema path', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-schema-duplicate-path');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /plans\[1\]\.path duplicates a previous plan path: docs\/planning\/fixture-clean-plan\.md\./,
  );
});

test('assert-clean fails on fixture with plans schema path outside docs markdown tree', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-schema-nondocs-path');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /plans\[0\]\.path \(cms\/seed\/data\/fixture-clean-plan\.json\) must be a docs markdown path \(docs\/\*\*\/\*\.md\)\./,
  );
});

test('assert-clean fails on fixture with duplicate roadmap item IDs', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-duplicate-roadmap-item-id');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(combinedOutput, /roadmap\.tiers\[1\]\.items\[0\]\.id duplicates a previous roadmap item id: T1\.09\./);
});

test('assert-clean fails on fixture with duplicate roadmap planId without alias marker', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-duplicate-plan-id');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[1\]\.items\[0\]\.planId duplicates a previous roadmap planId: fixture-duplicate-plan-id\./,
  );
});

test('assert-clean passes on fixture with duplicate roadmap planId explicitly marked as intentional alias', () => {
  const fixtureRoot = path.join(fixturesRoot, 'intentional-plan-id-alias');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.equal(run.status, 0, combinedOutput);
});

test('assert-clean fails on fixture when roadmap item planId is missing from plans export', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-missing-plan-record');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planId does not exist in plans export: fixture-missing-plan-record\./,
  );
});

test('assert-clean fails on fixture when roadmap plan.path and plans export path mismatch', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-path-mismatch');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.plan\.path \(docs\/planning\/fixture-plan-path-mismatch-roadmap\.md\) does not match plans export path \(docs\/planning\/fixture-plan-path-mismatch-plans\.md\) for planId fixture-plan-path-mismatch\./,
  );
});

test('assert-clean fails on fixture with missing tier/cloudStatus for tier1/tier2 roadmap item', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-missing-tier-cloud-fields');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.tier must be a non-empty string for tier1\/tier2 items\./,
  );
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.cloudStatus must be a non-empty string for tier1\/tier2 items\./,
  );
});

test('assert-clean fails on fixture when item tier mismatches containing tier id', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-item-tier-mismatch');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.tier \(tier2\) must match containing tier id \(tier1\)\./,
  );
});

test('assert-clean fails on fixture with invalid roadmap status enum value', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-invalid-status-value');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.status \(done\) must be one of: queued, active, shipped, tested, canceled\./,
  );
});

test('assert-clean fails on fixture with invalid roadmap cloudStatus enum value', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-invalid-cloudstatus-value');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.cloudStatus \(ok\) must be one of: pending, deploying, healthy\./,
  );
});

test('assert-clean fails on fixture with non-canonical tier plan path without explicit exception marker', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-noncanonical-plan-doc-path');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planId \(fixture-noncanonical-plan\) resolves to non-canonical plan path \(docs\/legacy\/fixture-noncanonical-plan\.md\)\./,
  );
});

test('assert-clean passes on fixture with non-canonical tier plan path and explicit exception marker', () => {
  const fixtureRoot = path.join(fixturesRoot, 'intentional-noncanonical-plan-doc-path');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.equal(run.status, 0, combinedOutput);
});

test('assert-clean fails on fixture with non-canonical path exception missing owner/timebox metadata', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-path-exception-missing-metadata');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planPathCanonicalExceptionOwner is required when planPathCanonicalExceptionIntentional is true\./,
  );
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planPathCanonicalExceptionCreatedAt is required when planPathCanonicalExceptionIntentional is true\./,
  );
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planPathCanonicalExceptionExpiresAt is required when planPathCanonicalExceptionIntentional is true\./,
  );
});

test('assert-clean fails on fixture with non-canonical path exception missing ticket', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-path-exception-missing-ticket');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planPathCanonicalExceptionTicket is required when planPathCanonicalExceptionIntentional is true\./,
  );
});

test('assert-clean fails on fixture with non-canonical path exception invalid CreatedAt timestamp format', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-path-exception-invalid-createdat-format');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planPathCanonicalExceptionCreatedAt must be a valid ISO 8601 UTC date-time string when provided \(example: 2026-04-01T00:00:00Z\)\./,
  );
});

test('assert-clean fails on fixture with future-dated non-canonical path exception CreatedAt', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-path-exception-createdat-future');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planPathCanonicalExceptionCreatedAt must not be in the future\./,
  );
});

test('assert-clean fails on fixture with expired non-canonical path exception window', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-path-exception-expired');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planPathCanonicalExceptionExpiresAt is expired\. Extend or remove the exception marker\./,
  );
});

test('assert-clean fails on fixture with non-canonical path exception window longer than maximum TTL', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-path-exception-window-too-long');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planPathCanonicalExceptionExpiresAt exceeds maximum exception window of 30 days from planPathCanonicalExceptionCreatedAt\./,
  );
});

test('assert-clean fails on fixture with tier/status/cloudStatus mismatch without parity exception marker', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-meta-parity-mismatch');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.status \(active\) does not match plans export status \(shipped\) for planId fixture-plan-meta-mismatch\./,
  );
});

test('assert-clean passes on fixture with tier/status/cloudStatus mismatch and explicit parity exception marker', () => {
  const fixtureRoot = path.join(fixturesRoot, 'intentional-plan-meta-parity-exception');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.equal(run.status, 0, combinedOutput);
});

test('assert-clean passes on fixture with provider-agnostic non-GitHub https ticket URL', () => {
  const fixtureRoot = path.join(fixturesRoot, 'intentional-meta-exception-non-github-ticket');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.equal(run.status, 0, combinedOutput);
});

test('assert-clean fails on fixture with meta-parity exception missing owner/timebox metadata', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-meta-exception-missing-metadata');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planMetaParityExceptionOwner is required when planMetaParityExceptionIntentional is true\./,
  );
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planMetaParityExceptionCreatedAt is required when planMetaParityExceptionIntentional is true\./,
  );
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planMetaParityExceptionExpiresAt is required when planMetaParityExceptionIntentional is true\./,
  );
});

test('assert-clean fails on fixture with meta-parity exception missing ticket', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-meta-exception-missing-ticket');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planMetaParityExceptionTicket is required when planMetaParityExceptionIntentional is true\./,
  );
});

test('assert-clean fails on fixture with meta-parity exception invalid CreatedAt timestamp format', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-meta-exception-invalid-createdat-format');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planMetaParityExceptionCreatedAt must be a valid ISO 8601 UTC date-time string when provided \(example: 2026-04-01T00:00:00Z\)\./,
  );
});

test('assert-clean fails on fixture with future-dated meta-parity exception CreatedAt', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-meta-exception-createdat-future');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planMetaParityExceptionCreatedAt must not be in the future\./,
  );
});

test('assert-clean fails on fixture with expired meta-parity exception window', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-meta-exception-expired');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planMetaParityExceptionExpiresAt is expired\. Extend or remove the exception marker\./,
  );
});

test('assert-clean fails on fixture with meta-parity exception window longer than maximum TTL', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-meta-exception-window-too-long');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planMetaParityExceptionExpiresAt exceeds maximum exception window of 30 days from planMetaParityExceptionCreatedAt\./,
  );
});

test('assert-clean fails on fixture with stale parity exception marker when values already match', () => {
  const fixtureRoot = path.join(fixturesRoot, 'stale-plan-meta-parity-exception');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planMetaParityExceptionIntentional must be omitted because tier\/status\/cloudStatus already match plans export for planId fixture-plan-meta-stale-exception\./,
  );
});

test('assert-clean fails on fixture with missing required Tier1/Tier2 reference fields', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-missing-reference-fields');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.referenceLabel must be a non-empty string for tier1\/tier2 items\./,
  );
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.referenceUrl must be a non-empty string for tier1\/tier2 items\./,
  );
});

test('assert-clean fails on fixture with referenceLabel/referenceUrl mismatch without parity exception marker', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-reference-parity-mismatch');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.referenceLabel \(docs\/run-logs\/fixture-reference-parity\/00-overview\.md\) does not match plans export path \(docs\/planning\/fixture-reference-parity\.md\) for planId fixture-reference-parity\./,
  );
});

test('assert-clean fails on fixture with reference parity exception missing owner/timebox metadata', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-reference-exception-missing-metadata');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planReferenceParityExceptionOwner is required when planReferenceParityExceptionIntentional is true\./,
  );
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planReferenceParityExceptionCreatedAt is required when planReferenceParityExceptionIntentional is true\./,
  );
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planReferenceParityExceptionExpiresAt is required when planReferenceParityExceptionIntentional is true\./,
  );
});

test('assert-clean fails on fixture with reference parity exception missing ticket', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-reference-exception-missing-ticket');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planReferenceParityExceptionTicket is required when planReferenceParityExceptionIntentional is true\./,
  );
});

test('assert-clean fails on fixture with reference parity exception invalid CreatedAt timestamp format', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-reference-exception-invalid-createdat-format');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planReferenceParityExceptionCreatedAt must be a valid ISO 8601 UTC date-time string when provided \(example: 2026-04-01T00:00:00Z\)\./,
  );
});

test('assert-clean fails on fixture with future-dated reference parity exception CreatedAt', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-reference-exception-createdat-future');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planReferenceParityExceptionCreatedAt must not be in the future\./,
  );
});

test('assert-clean fails on fixture with reference parity exception invalid ticket URL', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-reference-exception-invalid-ticket');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planReferenceParityExceptionTicket must be an absolute https URL when provided\./,
  );
});

test('assert-clean fails on fixture with expired reference parity exception window', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-reference-exception-expired');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planReferenceParityExceptionExpiresAt is expired\. Extend or remove the exception marker\./,
  );
});

test('assert-clean fails on fixture with reference parity exception window longer than maximum TTL', () => {
  const fixtureRoot = path.join(fixturesRoot, 'broken-plan-reference-exception-window-too-long');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planReferenceParityExceptionExpiresAt exceeds maximum exception window of 30 days from planReferenceParityExceptionCreatedAt\./,
  );
});

test('assert-clean passes on fixture with referenceLabel/referenceUrl mismatch and explicit parity exception marker', () => {
  const fixtureRoot = path.join(fixturesRoot, 'intentional-plan-reference-parity-exception');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.equal(run.status, 0, combinedOutput);
});

test('assert-clean fails on fixture with stale reference parity exception marker when values already align', () => {
  const fixtureRoot = path.join(fixturesRoot, 'stale-plan-reference-parity-exception');
  const run = runAssertClean(fixtureRoot);
  const combinedOutput = `${run.stdout}\n${run.stderr}`;

  assert.notEqual(run.status, 0);
  assert.match(combinedOutput, /Blocking issues detected/i);
  assert.match(combinedOutput, /Schema validation errors detected/i);
  assert.match(
    combinedOutput,
    /roadmap\.tiers\[0\]\.items\[0\]\.planReferenceParityExceptionIntentional must be omitted because referenceLabel\/referenceUrl already align to plans export path for planId fixture-reference-parity-stale-exception\./,
  );
});
