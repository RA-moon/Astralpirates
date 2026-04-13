import assert from 'node:assert/strict';
import test from 'node:test';

import { envFlagEnabled, isLocalHost } from './local-env-guards.mjs';

test('envFlagEnabled accepts standard truthy toggles', () => {
  assert.equal(envFlagEnabled('1'), true);
  assert.equal(envFlagEnabled('true'), true);
  assert.equal(envFlagEnabled('yes'), true);
  assert.equal(envFlagEnabled('on'), true);
  assert.equal(envFlagEnabled('off'), false);
});

test('isLocalHost detects localhost-style hosts', () => {
  assert.equal(isLocalHost('http://localhost:3000'), true);
  assert.equal(isLocalHost('http://127.0.0.1:3000'), true);
  assert.equal(isLocalHost('http://cms.local'), true);
  assert.equal(isLocalHost('https://astralpirates.com'), false);
});
