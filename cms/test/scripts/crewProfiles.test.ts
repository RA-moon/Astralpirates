import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('crewProfiles test-user flags', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv('SEED_DEFAULT_PASSWORD', 'dev-secret');
    vi.stubEnv('PAYLOAD_PUBLIC_SERVER_URL', 'http://localhost:3000');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('marks dummy seed profiles as test users', async () => {
    vi.stubEnv('CMS_SEED_PROFILE', 'dummy');
    vi.stubEnv('CMS_SEED_TESTCASE', 'roles');

    const { IS_DUMMY_SEED_PROFILE, crewProfiles } = await import('@/src/scripts/crewProfiles.ts');

    expect(IS_DUMMY_SEED_PROFILE).toBe(true);
    expect(crewProfiles.length).toBeGreaterThan(0);
    expect(crewProfiles.every((profile) => profile.isTestUser === true)).toBe(true);
    expect(crewProfiles.every((profile) => profile.accountType === 'test')).toBe(true);
  });

  it('marks real seed profiles as non-test users', async () => {
    vi.stubEnv('CMS_SEED_PROFILE', 'real');

    const { IS_DUMMY_SEED_PROFILE, crewProfiles } = await import('@/src/scripts/crewProfiles.ts');

    expect(IS_DUMMY_SEED_PROFILE).toBe(false);
    expect(crewProfiles.length).toBeGreaterThan(0);
    expect(crewProfiles.every((profile) => profile.isTestUser === false)).toBe(true);
    expect(crewProfiles.every((profile) => profile.accountType === 'human')).toBe(true);
  });
});
