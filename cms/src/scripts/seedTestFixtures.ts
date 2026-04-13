import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { ensureOwnerMembership } from '@/app/api/_lib/flightPlanMembers';
import { buildLogPath } from '@astralpirates/shared/logs';
import { buildMissionTaskFixtures } from '../seed/taskFixtures';
import { DEFAULT_TEST_RUN_CADENCE } from '../constants/testRunCadences';
import { CMS_SEED_TESTCASE, IS_DUMMY_SEED_PROFILE } from './crewProfiles';
import { isDirectExecution } from './_lib/directExecution';
import { envFlagEnabled } from './_lib/localScriptGuards';
import { closePayloadLifecycle } from './_lib/payloadRuntime';
import { seedUsers } from './seedUsers';
import { resolveTestPack } from './testPacks';
import {
  buildLexicalDoc,
  findUserByEmail,
  isLocalHost,
  slugifyTestValue,
} from './_lib/testFixtureHelpers';

const ensureFlightPlan = async ({
  testcase,
  ownerId,
}: {
  testcase: string;
  ownerId: number;
}) => {
  const slug = slugifyTestValue(`test-${testcase}`);
  const title = `Test: ${testcase}`;
  const summary = `Test fixtures for ${testcase}`;

  const existing = await payload.find({
    collection: 'flight-plans',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existing.docs[0]) {
    return existing.docs[0];
  }

  const created = await payload.create({
    collection: 'flight-plans',
    data: {
      title,
      slug,
      path: `bridge/flight-plans/${slug}`,
      summary,
      location: 'Local development',
      dateCode: testcase,
      displayDate: 'Local',
      eventDate: null,
      isPublic: false,
      category: 'test',
      status: 'planned',
      iterationNumber: 1,
      owner: ownerId,
      body: buildLexicalDoc(summary),
    },
    draft: false,
    overrideAccess: true,
  });
  return created;
};

const seedFixtureLog = async ({
  testcase,
  ownerId,
  flightPlanId,
  slugOverride,
  headlineOverride,
  bodyOverride,
}: {
  testcase: string;
  ownerId: number;
  flightPlanId: number | null;
  slugOverride?: string | null;
  headlineOverride?: string | null;
  bodyOverride?: string | null;
}) => {
  const fallbackSlug = slugifyTestValue(`test-${testcase}-fixture-log`);
  const slug =
    (typeof slugOverride === 'string' && slugOverride.trim().length ? slugOverride.trim() : null) ?? fallbackSlug;
  const headline =
    (typeof headlineOverride === 'string' && headlineOverride.trim().length
      ? headlineOverride.trim()
      : null) ?? `Fixture log for ${testcase}`;
  const body =
    (typeof bodyOverride === 'string' && bodyOverride.trim().length
      ? bodyOverride.trim()
      : null) ??
    [
      `This is a deterministic fixture log for testcase "${testcase}".`,
      'Use it for read/view UI and API flows without creating ad-hoc content.',
      'Owner is the seeded captain; slug and headline are stable across reseeds.',
    ].join(' ');

  const existing = await payload.find({
    collection: 'logs',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existing.docs[0]?.id) {
    await payload.update({
      collection: 'logs',
      id: existing.docs[0].id,
      data: {
        slug,
        headline,
        title: headline,
        body,
        owner: ownerId,
        flightPlan: flightPlanId ?? undefined,
      },
      overrideAccess: true,
    });
    return { created: false, slug };
  }

  await payload.create({
    collection: 'logs',
    data: {
      slug,
      path: buildLogPath(slug),
      headline,
      title: headline,
      body,
      owner: ownerId,
      flightPlan: flightPlanId ?? undefined,
    },
    draft: false,
    overrideAccess: true,
  });
  return { created: true, slug };
};

const seedBaselineTasks = async ({
  flightPlanId,
  ownerId,
  planTitle,
}: {
  flightPlanId: number;
  ownerId: number;
  planTitle: string | null;
}) => {
  const existing = await payload.find({
    collection: 'flight-plan-tasks',
    where: { flightPlan: { equals: flightPlanId } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  if (existing.docs.length > 0) {
    return { created: 0 };
  }

  const ownerMembership = await ensureOwnerMembership({
    payload,
    flightPlanId,
    ownerId,
  });
  if (!ownerMembership) {
    throw new Error('Unable to resolve owner membership for baseline task seeding.');
  }

  const fixtures = buildMissionTaskFixtures(planTitle ?? undefined);
  const baseOrder = 1000;
  for (const fixture of fixtures) {
    await payload.create({
      collection: 'flight-plan-tasks',
      data: {
        flightPlan: flightPlanId,
        ownerMembership: ownerMembership.id,
        title: fixture.title,
        description: buildLexicalDoc(fixture.description),
        state: fixture.state,
        listOrder: baseOrder + fixture.order,
        testRunCadence: DEFAULT_TEST_RUN_CADENCE,
        version: 1,
        assigneeMembershipIds: [],
      },
      draft: false,
      overrideAccess: true,
    });
  }
  return { created: fixtures.length };
};

type SeedFixtureOptions = {
  skipInit?: boolean;
  skipShutdown?: boolean;
  allowNonLocal?: boolean;
  ownerEmailOverride?: string | null;
};

export const seedTestFixtures = async ({
  skipInit = false,
  skipShutdown = false,
  allowNonLocal = envFlagEnabled(process.env.TEST_FIXTURES_ALLOW_NONLOCAL),
  ownerEmailOverride: ownerOverrideParam,
}: SeedFixtureOptions = {}) => {
  const ownerEmailOverride =
    ownerOverrideParam ||
    (typeof process.env.TEST_FIXTURES_OWNER_EMAIL === 'string' &&
    process.env.TEST_FIXTURES_OWNER_EMAIL.trim().length > 0
      ? process.env.TEST_FIXTURES_OWNER_EMAIL.trim()
      : null);

  const isLocal = isLocalHost(process.env.PAYLOAD_PUBLIC_SERVER_URL);

  if (!IS_DUMMY_SEED_PROFILE && !allowNonLocal) {
    return { skipped: true, reason: 'non-dummy-profile' };
  }
  if (!isLocal && !allowNonLocal) {
    return { skipped: true, reason: 'non-local-host' };
  }
  if (!isLocal && allowNonLocal && !ownerEmailOverride) {
    return { skipped: true, reason: 'missing-owner-email' };
  }

  const testcase = CMS_SEED_TESTCASE.trim() || 'roles';
  const pack = resolveTestPack(testcase);
  const captainEmail = ownerEmailOverride ?? `test-${testcase.toLowerCase()}.captain@astralpirates.com`;

  if (!skipInit) {
    await payload.init({ config: payloadConfig });
  }

  try {
    // Only upsert dummy users when in the default local/dummy profile flow.
    if (IS_DUMMY_SEED_PROFILE && isLocal) {
      await seedUsers({ skipInit: true, skipShutdown: true });
    }

    const captain = await findUserByEmail(payload, captainEmail);
    if (!captain?.id) {
      throw new Error(`Captain user not found for testcase "${testcase}" (${captainEmail}).`);
    }
    const ownerId = Number(captain.id);

    const plan = await ensureFlightPlan({ testcase, ownerId });
    const planId = Number(plan?.id);
    const logResult = await seedFixtureLog({
      testcase,
      ownerId,
      flightPlanId: Number.isFinite(planId) ? planId : null,
      slugOverride: pack.fixtures?.logSlug,
      headlineOverride: pack.fixtures?.logHeadline,
      bodyOverride: pack.fixtures?.logBody,
    });
    const tasksResult =
      Number.isFinite(planId) && planId != null
        ? await seedBaselineTasks({
            flightPlanId: planId,
            ownerId,
            planTitle: typeof plan?.title === 'string' ? plan.title : null,
          })
        : { created: 0 };

    return {
      skipped: false,
      logCreated: logResult.created,
      logSlug: logResult.slug,
      tasksCreated: tasksResult.created,
    };
  } finally {
    if (!skipShutdown) {
      await closePayloadLifecycle(payload, 'shutdown-first');
    }
  }
};

if (isDirectExecution(import.meta.url)) {
  seedTestFixtures()
    .then((result) => {
      if (result.skipped) {
        console.warn(`[test-fixtures] skipped (${result.reason ?? 'guard'})`);
      } else {
        console.log(
          `[test-fixtures] Seeded fixtures — log: ${result.logCreated ? 'created' : 'updated'} (${result.logSlug}), baseline tasks created: ${result.tasksCreated}`,
        );
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
