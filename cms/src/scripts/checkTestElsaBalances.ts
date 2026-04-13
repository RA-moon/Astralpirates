import payload from 'payload';
import type { Payload } from 'payload';

import payloadConfig from '../../payload.config.ts';
import { CMS_SEED_TESTCASE, IS_DUMMY_SEED_PROFILE, crewProfiles } from './crewProfiles';
import { resolveRequiredElsaForRole, resolveTestPack } from './testPacks';
import {
  normalizeElsa,
  summarizeBalanceChecks,
  type BalanceCheck,
} from './checkTestElsaBalances.helpers';
import { isDirectExecution } from './_lib/directExecution';
import { envFlagEnabled } from './_lib/localScriptGuards';
import { closePayloadLifecycle } from './_lib/payloadRuntime';
import { findUserByEmail, isLocalHost } from './_lib/testFixtureHelpers';
export type { BalanceCheckSummary } from './checkTestElsaBalances.helpers';

export const collectBalanceChecks = async (
  instance: Payload,
  packId: string,
): Promise<BalanceCheck[]> => {
  const pack = resolveTestPack(packId);
  const seenEmails = new Set<string>();
  const checks: BalanceCheck[] = [];

  for (const profile of crewProfiles) {
    const required = resolveRequiredElsaForRole(pack, profile.role);
    if (required <= 0) continue;

    const normalizedEmail = profile.email.toLowerCase();
    if (seenEmails.has(normalizedEmail)) continue;
    seenEmails.add(normalizedEmail);

    const doc = await findUserByEmail(instance, profile.email);
    if (!doc?.id) {
      checks.push({
        email: profile.email,
        role: profile.role,
        required,
        actual: null,
        missing: true,
      });
      continue;
    }

    checks.push({
      email: profile.email,
      role: profile.role,
      required,
      actual: normalizeElsa((doc as any)?.elsaTokens ?? 0),
      missing: false,
    });
  }

  return checks;
};

export const checkTestElsaBalances = async () => {
  const allowNonLocal = envFlagEnabled(process.env.TEST_ELSA_ALLOW_NONLOCAL);
  const allowNonDummy = envFlagEnabled(process.env.TEST_ELSA_ALLOW_NON_DUMMY);
  const isLocal = isLocalHost(process.env.PAYLOAD_PUBLIC_SERVER_URL);

  if (!isLocal && !allowNonLocal) {
    console.warn(
      '[elsa-balance] skipping check: PAYLOAD_PUBLIC_SERVER_URL is not local (set TEST_ELSA_ALLOW_NONLOCAL=1 to override)',
    );
    return;
  }
  if (!IS_DUMMY_SEED_PROFILE && !allowNonDummy) {
    console.warn(
      '[elsa-balance] skipping check: CMS_SEED_PROFILE is not "dummy" (set TEST_ELSA_ALLOW_NON_DUMMY=1 to override)',
    );
    return;
  }

  const packId = CMS_SEED_TESTCASE.trim() || 'roles';
  const pack = resolveTestPack(packId);
  const instance = await payload.init({ config: payloadConfig });

  try {
    const checks = await collectBalanceChecks(instance, pack.id);
    if (!checks.length) {
      console.log(`[elsa-balance] No E.L.S.A. requirements defined for pack "${pack.id}".`);
      return;
    }

    const summary = summarizeBalanceChecks(checks);

    if (summary.missingUsers.length || summary.insufficient.length) {
      summary.missingUsers.forEach((entry) =>
        console.error(
          `[elsa-balance] missing user ${entry.email} (${entry.role}) — requires >=${entry.required} E.L.S.A. for pack "${pack.id}"`,
        ),
      );
      summary.insufficient.forEach((entry) =>
        console.error(
          `[elsa-balance] ${entry.email} has ${entry.actual ?? 0} E.L.S.A. (<${entry.required}) for pack "${pack.id}" (${entry.role})`,
        ),
      );
      process.exitCode = 1;
      return;
    }

    console.log(
      `[elsa-balance] OK for pack "${pack.id}" — checked ${summary.ok.length} users with required balances`,
    );
  } finally {
    await closePayloadLifecycle(instance, 'shutdown-first');
  }
};

if (isDirectExecution(import.meta.url)) {
  checkTestElsaBalances().catch((error) => {
    console.error('[elsa-balance] failed', error);
    process.exitCode = 1;
  });
}
