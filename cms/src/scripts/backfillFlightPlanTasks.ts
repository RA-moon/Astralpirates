import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import {
  ensureOwnerMembership,
  normaliseId,
  sanitizeFlightPlanSlug,
} from '@/app/api/_lib/flightPlanMembers';
import { buildMissionTaskFixtures } from '../seed/taskFixtures';
import { closePayloadLifecycle } from './_lib/payloadRuntime';
import { normalizeRichTextContent, richTextContentToLexicalDocument } from '@/app/api/_lib/content';

const toLexical = (value: string) => richTextContentToLexicalDocument(normalizeRichTextContent(value));

const parseArgs = () => {
  const args = process.argv.slice(2);
  const slugIndex = args.findIndex((arg) => arg === '--slug' || arg === '-s');
  const rawSlug = slugIndex !== -1 ? args[slugIndex + 1] : null;
  const force = args.includes('--force');
  if (!rawSlug) {
    throw new Error('Usage: pnpm --dir cms tasks:backfill -- --slug <flight-plan-slug> [--force]');
  }
  const slug = sanitizeFlightPlanSlug(rawSlug);
  if (!slug) {
    throw new Error('Flight plan slug is required.');
  }
  return { slug, force };
};

const run = async (): Promise<void> => {
  const { slug, force } = parseArgs();
  await payload.init({ config: payloadConfig });

  try {
    const result = await payload.find({
      collection: 'flight-plans',
      where: {
        slug: {
          equals: slug,
        },
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const plan = result.docs[0];
    if (!plan) {
      throw new Error(`No flight plan found for slug "${slug}".`);
    }
    const planId = normaliseId(plan.id);
    const ownerId = normaliseId((plan as Record<string, unknown> | undefined)?.owner);
    if (planId == null || ownerId == null) {
      throw new Error('Flight plan is missing identifiers required for task seeding.');
    }

    const existingTasks = await payload.find({
      collection: 'flight-plan-tasks',
      where: {
        flightPlan: {
          equals: planId,
        },
      },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });
    if (existingTasks.docs.length > 0 && !force) {
      console.log(
        `[mission-tasks] ${existingTasks.docs.length} task(s) already exist for "${slug}". Re-run with --force to append fixtures.`,
      );
      return;
    }

    const ownerMembership = await ensureOwnerMembership({
      payload,
      flightPlanId: planId,
      ownerId,
    });
    if (!ownerMembership) {
      throw new Error('Failed to resolve the owner membership for this mission.');
    }

    const fixtures = buildMissionTaskFixtures((plan as Record<string, unknown> | undefined)?.title as string | undefined);
    const baseTime = Date.now();

    for (const fixture of fixtures) {
      await payload.create({
        collection: 'flight-plan-tasks',
        data: {
          flightPlan: planId,
          ownerMembership: ownerMembership.id,
          title: fixture.title,
          description: toLexical(fixture.description),
          state: fixture.state,
          listOrder: baseTime + fixture.order,
          assigneeMembershipIds: [],
        },
        draft: false,
        overrideAccess: true,
      });
    }

    console.log(
      `[mission-tasks] Seeded ${fixtures.length} fixtures for /flight-plans/${slug}. Record the run in backups/live/payload-migration.log.`,
    );
  } finally {
    await closePayloadLifecycle(payload);
  }
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
