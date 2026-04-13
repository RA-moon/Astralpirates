import assert from 'node:assert/strict';
import test from 'node:test';
import { findPlaceholderPathTokens } from './lib/docs-placeholder-path-tokens.mjs';

test('detects placeholder token for generic docs path', () => {
  const content = 'Use `docs/...md` as placeholder.';
  const matches = findPlaceholderPathTokens(content);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].token, 'docs/...md');
});

test('detects placeholder token for run-log docs path', () => {
  const content = 'Use `docs/run-logs/...` placeholder';
  const matches = findPlaceholderPathTokens(content);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].token, 'docs/run-logs/...');
});

test('does not detect concrete docs paths', () => {
  const content = 'Use `docs/planning/README.md` and `docs/run-logs/2026-04-01/00-overview.md`.';
  const matches = findPlaceholderPathTokens(content);
  assert.equal(matches.length, 0);
});

test('detects multiple placeholders in one content block', () => {
  const content = '`docs/...md` plus `docs/run-logs/...` plus `docs/...`';
  const matches = findPlaceholderPathTokens(content);
  assert.deepEqual(matches.map((match) => match.token), ['docs/...md', 'docs/run-logs/...', 'docs/...']);
});
