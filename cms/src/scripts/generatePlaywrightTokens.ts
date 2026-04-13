import fs from 'node:fs/promises';
import path from 'node:path';

import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { CMS_SEED_TESTCASE, crewProfiles, IS_DUMMY_SEED_PROFILE } from './crewProfiles';
import { isDirectExecution } from './_lib/directExecution';
import { envFlagEnabled } from './_lib/localScriptGuards';
import { isLocalHost } from './_lib/testFixtureHelpers';

type LoginResult = {
  token: string | null;
  profileSlug: string | null;
  email: string;
};

const resolveApiBase = () =>
  process.env.PLAYWRIGHT_API_BASE ??
  process.env.ASTRAL_API_BASE ??
  process.env.PAYLOAD_PUBLIC_SERVER_URL ??
  'http://localhost:3000';

const loginUser = async (email: string, password: string): Promise<LoginResult> => {
  const apiBase = resolveApiBase();
  const url = new URL('/api/users/login', apiBase);
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Login failed for ${email} (status ${response.status})`);
  }
  const payloadJson: any = await response.json();
  const token = typeof payloadJson?.token === 'string' ? payloadJson.token : null;
  const user = payloadJson?.user ?? payloadJson?.doc ?? null;
  const profileSlug =
    (user && typeof user.profileSlug === 'string' && user.profileSlug) ||
    (user && typeof user.slug === 'string' && user.slug) ||
    null;

  return { token, profileSlug, email };
};

const writeEnvFile = async ({
  captain,
  crew,
  outputPath,
}: {
  captain: LoginResult;
  crew: LoginResult;
  outputPath: string;
}) => {
  const lines = [
    `PLAYWRIGHT_CAPTAIN_TOKEN=${captain.token ?? ''}`,
    `PLAYWRIGHT_CREW_TOKEN=${crew.token ?? ''}`,
    `PLAYWRIGHT_CREW_SLUG=${crew.profileSlug ?? ''}`,
  ];
  const content = `${lines.join('\n')}\n`;
  await fs.writeFile(outputPath, content, 'utf8');
};

export const generatePlaywrightTokens = async () => {
  const isLocal = isLocalHost(process.env.PAYLOAD_PUBLIC_SERVER_URL);
  if (!isLocal && !envFlagEnabled(process.env.PLAYWRIGHT_TOKENS_ALLOW_NONLOCAL)) {
    throw new Error(
      'Refusing to generate Playwright tokens on non-local host. Set PLAYWRIGHT_TOKENS_ALLOW_NONLOCAL=1 to override.',
    );
  }

  await payload.init({ config: payloadConfig });

  const testcase = CMS_SEED_TESTCASE.trim() || 'roles';
  const testUserPassword = process.env.SEED_DEFAULT_PASSWORD;
  if (!testUserPassword) {
    throw new Error('Set SEED_DEFAULT_PASSWORD before generating Playwright tokens.');
  }

  // Prefer seeded pack users for the active testcase.
  const captainProfile =
    crewProfiles.find(
      (profile) =>
        profile.role === 'captain' && profile.email.toLowerCase().startsWith(`test-${testcase.toLowerCase()}.`),
    ) ??
    crewProfiles.find((profile) => profile.role === 'captain') ??
    crewProfiles[0];

  const crewProfile =
    crewProfiles.find(
      (profile) =>
        profile.role !== 'captain' && profile.email.toLowerCase().startsWith(`test-${testcase.toLowerCase()}.`),
    ) ??
    crewProfiles.find((profile) => profile.role !== 'captain');

  if (!captainProfile || !crewProfile) {
    throw new Error('Could not resolve captain/crew profiles for token generation.');
  }

  // Ensure users exist when using dummy/local profile.
  if (IS_DUMMY_SEED_PROFILE) {
    await payload.login({
      collection: 'users',
      data: { email: captainProfile.email, password: testUserPassword },
    }).catch(() => null);
  }

  const captainToken = await loginUser(captainProfile.email, testUserPassword);
  const crewToken = await loginUser(crewProfile.email, testUserPassword);

  if (!captainToken.token || !crewToken.token) {
    throw new Error('Missing token(s) from login responses.');
  }

  const output = path.resolve(
    process.cwd(),
    process.env.PLAYWRIGHT_ENV_PATH || '.env.playwright.local',
  );
  await writeEnvFile({ captain: captainToken, crew: crewToken, outputPath: output });

  return {
    captain: captainToken.email,
    crew: crewToken.email,
    crewSlug: crewToken.profileSlug,
    output,
  };
};

if (isDirectExecution(import.meta.url)) {
  generatePlaywrightTokens()
    .then((result) => {
      console.log(
        `[playwright-tokens] wrote tokens to ${result.output} (captain: ${result.captain}, crew: ${result.crew}, crew slug: ${result.crewSlug ?? 'unknown'})`,
      );
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
