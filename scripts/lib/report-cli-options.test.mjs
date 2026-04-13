import assert from 'node:assert/strict';
import test from 'node:test';

import { applyReportCliArgs, findFirstPositionalArg, parseBooleanEnvFlag } from './report-cli-options.mjs';

test('parseBooleanEnvFlag handles supported truthy forms', () => {
  assert.equal(parseBooleanEnvFlag('1'), true);
  assert.equal(parseBooleanEnvFlag('true'), true);
  assert.equal(parseBooleanEnvFlag('yes'), true);
  assert.equal(parseBooleanEnvFlag('on'), true);
  assert.equal(parseBooleanEnvFlag('0'), false);
  assert.equal(parseBooleanEnvFlag('no'), false);
  assert.equal(parseBooleanEnvFlag(undefined), false);
});

test('applyReportCliArgs applies value and boolean flags', () => {
  const options = {
    baseUrl: 'https://default.example',
    metricsPath: '/api/ship-status/metrics',
    dryRun: false,
  };
  const { helpRequested } = applyReportCliArgs({
    argv: ['--base', 'https://cli.example', '--dry-run', '--metrics-path=/api/custom'],
    options,
    valueFlags: {
      '--base': 'baseUrl',
      '--base-url': 'baseUrl',
      '--metrics-path': 'metricsPath',
    },
    booleanFlags: {
      '--dry-run': 'dryRun',
    },
  });

  assert.equal(helpRequested, false);
  assert.equal(options.baseUrl, 'https://cli.example');
  assert.equal(options.metricsPath, '/api/custom');
  assert.equal(options.dryRun, true);
});

test('applyReportCliArgs reports help request and supports alias forms', () => {
  const options = { mode: 'daily' };
  const { helpRequested } = applyReportCliArgs({
    argv: ['--help', '--mode=weekly'],
    options,
    valueFlags: {
      '--mode': 'mode',
    },
  });

  assert.equal(helpRequested, true);
  assert.equal(options.mode, 'weekly');
});

test('applyReportCliArgs supports repeatable value flags', () => {
  const options = { endpoints: [] };
  applyReportCliArgs({
    argv: [
      '--endpoint',
      '/health-a',
      '--endpoint=/health-b',
      '--health',
      '/health-c',
    ],
    options,
    valueFlags: {},
    repeatableValueFlags: {
      '--endpoint': 'endpoints',
      '--health': 'endpoints',
    },
  });

  assert.deepEqual(options.endpoints, ['/health-a', '/health-b', '/health-c']);
});

test('applyReportCliArgs can fail on unknown flags in strict mode', () => {
  const options = { baseUrl: 'https://default.example' };
  assert.throws(
    () =>
      applyReportCliArgs({
        argv: ['--base', 'https://cli.example', '--unknown-flag'],
        options,
        valueFlags: {
          '--base': 'baseUrl',
        },
        strictUnknown: true,
      }),
    /Unknown argument: --unknown-flag/,
  );
});

test('findFirstPositionalArg skips recognized flags and returns first positional value', () => {
  const positional = findFirstPositionalArg({
    argv: [
      '--origin',
      'https://flag.example',
      '--warn-only',
      '--api-path=/api/custom',
      'https://positional.example',
    ],
    valueFlags: {
      '--origin': 'origin',
      '--api-path': 'apiPath',
    },
    booleanFlags: {
      '--warn-only': 'warnOnly',
    },
  });

  assert.equal(positional, 'https://positional.example');
});
