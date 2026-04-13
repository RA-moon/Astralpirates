#!/usr/bin/env node
/**
 * Guard script to prevent running test fixture seeds on non-local environments
 * unless explicit allow flags are set. Intended for CI gates before seeding
 * fixtures on stage/prod.
 */

import { envFlagEnabled, isLocalHost } from './lib/local-env-guards.mjs';

const {
  PAYLOAD_PUBLIC_SERVER_URL,
  TEST_FIXTURES_ALLOW_NONLOCAL,
  TEST_FIXTURES_OWNER_EMAIL,
} = process.env;

const local = isLocalHost(PAYLOAD_PUBLIC_SERVER_URL);
const allowNonLocal = envFlagEnabled(TEST_FIXTURES_ALLOW_NONLOCAL);
const ownerEmail =
  typeof TEST_FIXTURES_OWNER_EMAIL === 'string' && TEST_FIXTURES_OWNER_EMAIL.trim().length
    ? TEST_FIXTURES_OWNER_EMAIL.trim()
    : null;

if (local) {
  console.log('[test-fixtures-guard] Local host detected; guard passed.');
  process.exit(0);
}

if (!allowNonLocal) {
  console.error(
    '[test-fixtures-guard] Blocking fixture seeding: PAYLOAD_PUBLIC_SERVER_URL is non-local and TEST_FIXTURES_ALLOW_NONLOCAL is not set.',
  );
  process.exit(1);
}

if (!ownerEmail) {
  console.error(
    '[test-fixtures-guard] Blocking fixture seeding: non-local fixture seeding requires TEST_FIXTURES_OWNER_EMAIL to be set.',
  );
  process.exit(1);
}

console.log(
  `[test-fixtures-guard] Non-local fixture seeding allowed via TEST_FIXTURES_ALLOW_NONLOCAL with owner ${ownerEmail}.`,
);
