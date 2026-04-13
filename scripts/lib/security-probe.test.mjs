import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSecurityProbeCollector,
  formatProbeRequestError,
  printSecurityProbeSummary,
} from './security-probe.mjs';

const captureConsole = async (run) => {
  const logs = {
    log: [],
    warn: [],
    error: [],
  };
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  console.log = (...args) => {
    logs.log.push(args.join(' '));
  };
  console.warn = (...args) => {
    logs.warn.push(args.join(' '));
  };
  console.error = (...args) => {
    logs.error.push(args.join(' '));
  };

  try {
    const result = await run();
    return { logs, result };
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }
};

test('createSecurityProbeCollector tracks failures and warnings', () => {
  const collector = createSecurityProbeCollector();
  collector.addFailure('failed');
  collector.addWarning('warning');

  assert.deepEqual(collector.failures, ['failed']);
  assert.deepEqual(collector.warnings, ['warning']);
});

test('formatProbeRequestError formats script, url, and error message', () => {
  const message = formatProbeRequestError({
    name: 'pages-health',
    url: 'https://astralpirates.com/api/pages/health',
    error: new Error('connection reset'),
  });

  assert.equal(
    message,
    '[pages-health] request failed for https://astralpirates.com/api/pages/health: connection reset',
  );
});

test('printSecurityProbeSummary reports success when no failures exist', async () => {
  const collector = createSecurityProbeCollector();
  const { logs, result } = await captureConsole(() =>
    printSecurityProbeSummary({
      scriptName: 'check-security-gates',
      collector,
      successMessage: '[check-security-gates] OK',
    }),
  );

  assert.deepEqual(result, { ok: true, warnOnlyTriggered: false });
  assert.deepEqual(logs.log, ['[check-security-gates] OK']);
  assert.deepEqual(logs.warn, []);
  assert.deepEqual(logs.error, []);
});

test('printSecurityProbeSummary reports warnings and failures', async () => {
  const collector = createSecurityProbeCollector();
  collector.addWarning('missing optional header');
  collector.addFailure('required header mismatch');

  const { logs, result } = await captureConsole(() =>
    printSecurityProbeSummary({
      scriptName: 'check-security-headers',
      collector,
    }),
  );

  assert.deepEqual(result, { ok: false, warnOnlyTriggered: false });
  assert.deepEqual(logs.warn, ['[check-security-headers] Warnings:', '- missing optional header']);
  assert.deepEqual(logs.error, ['[check-security-headers] Failures:', '- required header mismatch']);
});

test('printSecurityProbeSummary treats failures as non-fatal in warn-only mode', async () => {
  const collector = createSecurityProbeCollector();
  collector.addFailure('api probe failed');

  const { logs, result } = await captureConsole(() =>
    printSecurityProbeSummary({
      scriptName: 'check-security-gates',
      collector,
      warnOnly: true,
    }),
  );

  assert.deepEqual(result, { ok: true, warnOnlyTriggered: true });
  assert.deepEqual(logs.error, ['[check-security-gates] Failures:', '- api probe failed']);
  assert.deepEqual(logs.warn, ['[check-security-gates] warn-only mode enabled; exiting without failure.']);
});
