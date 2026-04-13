import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { ensureOwnerMembership } from '../app/api/_lib/flightPlanMembers';
import { CMS_SEED_PROFILE, CMS_SEED_TESTCASE, IS_DUMMY_SEED_PROFILE, crewProfiles } from './crewProfiles';
import { DEFAULT_TEST_RUN_CADENCE, type TestRunCadence } from '../constants/testRunCadences';
import { resolveTestPack, type TestScenario } from './testPacks';
import { maybeRunElsaTopUp } from './runElsaTopUp';
import { formatElsaTopUpSummary } from '../workers/elsaTopUpHelpers';
import {
  buildLexicalDoc,
  findUserByEmail,
  isLocalHost,
  slugifyTestValue,
} from './_lib/testFixtureHelpers';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

type TestPlanMatrixEntry = {
  testcase: string;
  title?: string;
  summary?: string;
  scenarios?: TestScenario[];
};

type MembershipUpsertResult = {
  membershipId: number | null;
  touched: boolean;
};

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD;
if (!DEFAULT_PASSWORD) {
  throw new Error('Set SEED_DEFAULT_PASSWORD before running syncTestPlans.');
}
const PACK_ENTRY: TestPlanMatrixEntry = (() => {
  const pack = resolveTestPack(CMS_SEED_TESTCASE);
  return {
    testcase: pack.id,
    title: pack.title ?? `Test: ${pack.id}`,
    summary: pack.summary ?? `Regression pack for ${pack.id}`,
    scenarios: pack.scenarios,
  };
})();


const ensureCrewMembership = async ({
  flightPlanId,
  userId,
  invitedById,
}: {
  flightPlanId: number;
  userId: number;
  invitedById: number | null;
}): Promise<MembershipUpsertResult> => {
  const nowIso = new Date().toISOString();
  const existing = await payload.find({
    collection: 'flight-plan-memberships',
    where: {
      and: [
        { flightPlan: { equals: flightPlanId } },
        { user: { equals: userId } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (existing.docs[0]) {
    const membershipId = Number(existing.docs[0].id);
    await payload.update({
      collection: 'flight-plan-memberships',
      id: membershipId,
      data: {
        role: 'crew',
        invitationStatus: 'accepted',
        invitedBy: invitedById ?? userId,
        invitedAt:
          typeof (existing.docs[0] as { invitedAt?: unknown }).invitedAt === 'string'
            ? (existing.docs[0] as { invitedAt?: string }).invitedAt
            : nowIso,
        respondedAt: nowIso,
      },
      overrideAccess: true,
    });
    return { membershipId, touched: false };
  }

  const created = await payload.create({
    collection: 'flight-plan-memberships',
    data: {
      flightPlan: flightPlanId,
      user: userId,
      role: 'crew',
      invitationStatus: 'accepted',
      invitedBy: invitedById ?? userId,
      invitedAt: nowIso,
      respondedAt: nowIso,
    },
    draft: false,
    overrideAccess: true,
  });

  return { membershipId: Number(created.id), touched: true };
};

const ensureFlightPlan = async ({
  entry,
  ownerId,
}: {
  entry: TestPlanMatrixEntry;
  ownerId: number | null;
}) => {
  const slug = slugifyTestValue(`test-${entry.testcase}`);
  const title = entry.title ?? `Test: ${entry.testcase}`;
  const summary = entry.summary ?? `Test plan for ${entry.testcase}`;

  const existing = await payload.find({
    collection: 'flight-plans',
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const doc = existing.docs[0];

  if (doc?.id) {
    return doc;
  }

  const created = await payload.create({
    collection: 'flight-plans',
    data: {
      title,
      slug,
      summary,
      location: 'Local development',
      dateCode: entry.testcase,
      displayDate: 'Local',
      eventDate: null,
      isPublic: false,
      owner: ownerId ?? undefined,
    },
    draft: false,
    overrideAccess: true,
  });
  return created;
};

const upsertTask = async ({
  flightPlanId,
  title,
  description,
  ownerMembershipId,
  listOrder,
  runCadence,
}: {
  flightPlanId: number;
  title: string;
  description: any;
  ownerMembershipId: number;
  listOrder: number;
  runCadence: TestRunCadence;
}) => {
  const existing = await payload.find({
    collection: 'flight-plan-tasks',
    where: {
      and: [
        { flightPlan: { equals: flightPlanId } },
        { title: { equals: title } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  if (existing.docs[0]?.id) {
    await payload.update({
      collection: 'flight-plan-tasks',
      id: existing.docs[0].id,
      data: {
        description,
        ownerMembership: ownerMembershipId,
        state: 'ideation',
        testRunCadence: runCadence,
        assigneeMembershipIds: [ownerMembershipId],
      },
      overrideAccess: true,
    });
    return false;
  }

  await payload.create({
    collection: 'flight-plan-tasks',
    data: {
      flightPlan: flightPlanId,
      title,
      description,
      state: 'ideation',
      listOrder,
      ownerMembership: ownerMembershipId,
      testRunCadence: runCadence,
      assigneeMembershipIds: [ownerMembershipId],
    },
    draft: false,
    overrideAccess: true,
  });
  return true;
};

const run = async () => {
  if (!IS_DUMMY_SEED_PROFILE) {
    console.warn('Skipping sync: CMS_SEED_PROFILE is not "dummy".');
    return;
  }
  if (!isLocalHost(process.env.PAYLOAD_PUBLIC_SERVER_URL)) {
    console.warn('Skipping sync: PAYLOAD_PUBLIC_SERVER_URL is not local.');
    return;
  }

  await payload.init({ config: payloadConfig });

  let createdPlans = 0;
  let touchedMemberships = 0;
  let createdTasks = 0;
  let updatedTasks = 0;
  let skipped = 0;

  for (const entry of [PACK_ENTRY]) {
    const testcase = entry.testcase?.trim();
    if (!testcase) {
      skipped += 1;
      continue;
    }

    const captainEmail = `test-${testcase.toLowerCase()}.captain@astralpirates.com`;
    const captain = await findUserByEmail(payload, captainEmail);
    if (!captain?.id) {
      console.warn(`Captain user not found for testcase "${testcase}" (${captainEmail}); skipping.`);
      skipped += 1;
      continue;
    }

    const plan = await ensureFlightPlan({ entry, ownerId: Number(captain.id) });
    if (plan?.id && plan.createdAt === plan.updatedAt) {
      createdPlans += 1;
    }
    const planId = Number(plan?.id);
    if (!Number.isFinite(planId)) {
      skipped += 1;
      continue;
    }

    const ownerMembership = await ensureOwnerMembership({
      payload,
      flightPlanId: planId,
      ownerId: Number(captain.id),
    });

    const inviterId = Number(captain.id);
    const baseOrder = Date.now();
    const scenarios = entry.scenarios && entry.scenarios.length ? entry.scenarios : [];

    for (let scenarioIndex = 0; scenarioIndex < scenarios.length; scenarioIndex += 1) {
      const scenario = scenarios[scenarioIndex];
      const scenarioCadence = scenario.runCadence ?? DEFAULT_TEST_RUN_CADENCE;
      for (let variantIndex = 0; variantIndex < crewProfiles.length; variantIndex += 1) {
        const profile = crewProfiles[variantIndex];
        const user = await findUserByEmail(payload, profile.email);
        if (!user?.id) {
          skipped += 1;
          continue;
        }
        const membership = await ensureCrewMembership({
          flightPlanId: planId,
          userId: Number(user.id),
          invitedById: inviterId,
        });
        if (membership.touched) {
          touchedMemberships += 1;
        }
        const membershipId = membership.membershipId ?? ownerMembership?.id ?? null;
        if (membershipId == null) {
          skipped += 1;
          continue;
        }

        const callSign = profile.callSign ?? profile.firstName ?? profile.email;
        const title = `${scenario.slug} / ${callSign}`;
        const descriptionText = [
          scenario.description ?? `Execute scenario "${scenario.slug}".`,
          `Login as ${profile.email} using the configured seed password (SEED_DEFAULT_PASSWORD).`,
          'Run the steps, record pass/fail with notes, then mark the task accordingly.',
        ].join(' ');
        const created = await upsertTask({
          flightPlanId: planId,
          title,
          description: buildLexicalDoc(descriptionText),
          ownerMembershipId: membershipId,
          listOrder: baseOrder + scenarioIndex * 100 + variantIndex,
          runCadence: scenarioCadence,
        });
        if (created) {
          createdTasks += 1;
        } else {
          updatedTasks += 1;
        }
      }
    }
  }

  const topUpResult = await maybeRunElsaTopUp({ payload, skipInit: true, skipShutdown: true });
  if (topUpResult.skipped) {
    console.log(`[elsa-top-up] skipped (${topUpResult.reason})`);
  } else {
    console.log(formatElsaTopUpSummary(topUpResult.summary));
  }

  console.log(
    `Test plans synced — created plans: ${createdPlans}, tasks created: ${createdTasks}, tasks updated: ${updatedTasks}, memberships touched: ${touchedMemberships}, skipped: ${skipped}`,
  );
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePayloadLifecycle(payload, 'close-first');
  });
