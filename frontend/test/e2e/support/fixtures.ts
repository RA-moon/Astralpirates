export type SeededAccount = {
  email: string;
  password: string;
  slug: string;
};

const normaliseTestcase = (value: string | undefined | null) => {
  const trimmed = (value ?? '').trim() || 'roles';
  return trimmed.startsWith('test-') ? trimmed : `test-${trimmed}`;
};

const testcase = normaliseTestcase(process.env.PLAYWRIGHT_TESTCASE);
const testcaseSuffix = testcase.replace(/^test-/, '') || 'roles';

const resolveSeedPassword = () =>
  (process.env.PLAYWRIGHT_SEED_PASSWORD ?? process.env.SEED_DEFAULT_PASSWORD ?? '').trim();

const withDefault = (value: string | undefined, fallback: string) =>
  (value && value.trim()) || fallback;

const requireSeedPassword = (): string => {
  const password = resolveSeedPassword();
  if (!password) {
    throw new Error(
      'Set PLAYWRIGHT_SEED_PASSWORD (or SEED_DEFAULT_PASSWORD) before running authenticated Playwright specs.',
    );
  }
  return password;
};

export const getSeededCaptain = (): SeededAccount => ({
  email: withDefault(process.env.PLAYWRIGHT_CAPTAIN_EMAIL, `${testcase}.captain@astralpirates.com`),
  password: requireSeedPassword(),
  slug: withDefault(process.env.PLAYWRIGHT_CAPTAIN_SLUG, `captain-${testcaseSuffix}`),
});

export const getSeededCrew = (): SeededAccount => ({
  email: withDefault(process.env.PLAYWRIGHT_CREW_EMAIL, `${testcase}.swabbie@astralpirates.com`),
  password: requireSeedPassword(),
  slug: withDefault(process.env.PLAYWRIGHT_CREW_SLUG, `swabbie-${testcaseSuffix}`),
});

export const seededPlanSlug = withDefault(
  process.env.PLAYWRIGHT_PLAN_SLUG,
  `test-${testcaseSuffix}`,
);

export const buildRecruitEmail = (label: string) => {
  const slug = label.replace(/[^a-z0-9]+/gi, '-').replace(/(^-|-$)+/g, '') || 'invite';
  return `playwright+${slug}-${Date.now()}@astralpirates.com`;
};
