import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import payload from 'payload';

import payloadConfig from '@/payload.config.ts';

type PlanSeed = {
  id: string;
  slug?: string | null;
  title: string;
  owner: string;
  tier?: string | null;
  status?: string | null;
  cloudStatus?: string | null;
  summary?: string | null;
  lastUpdated?: string | null;
  path?: string | null;
  links?: Array<{ label?: string | null; url: string }> | null;
  body?: unknown;
};

type PlansSeed = {
  generatedAt?: string | null;
  plans?: PlanSeed[];
};

type RoadmapPlanSeed = {
  id?: string | null;
  title?: string | null;
  owner?: string | null;
  path?: string | null;
  status?: string | null;
  cloudStatus?: string | null;
};

type RoadmapItemSeed = {
  id?: string | null;
  code?: string | null;
  title: string;
  summary?: string | null;
  status?: string | null;
  cloudStatus?: string | null;
  referenceLabel?: string | null;
  referenceUrl?: string | null;
  plan?: RoadmapPlanSeed | null;
};

type RoadmapTierSeed = {
  id: string;
  title: string;
  tier?: string | null;
  description?: string | null;
  focus?: string | null;
  statusSummary?: string | null;
  items?: RoadmapItemSeed[];
};

type RoadmapSeed = {
  generatedAt?: string | null;
  tiers?: RoadmapTierSeed[];
};

type UpsertSummary = {
  created: number;
  updated: number;
  skipped: number;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const hasFlag = (flag: string) => args.includes(flag);
  return {
    force: hasFlag('--force'),
    includePlanLinks:
      hasFlag('--include-plan-links') || process.env.CMS_PLANNING_SYNC_INCLUDE_PLAN_LINKS === 'true',
    roadmapOnly: hasFlag('--roadmap-only'),
    plansOnly: hasFlag('--plans-only'),
  };
};

const readSeedJson = async <T>(filePath: string): Promise<T> => {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
};

const main = async () => {
  const { force, includePlanLinks, roadmapOnly, plansOnly } = parseArgs();
  if (roadmapOnly && plansOnly) {
    throw new Error('Choose at most one of `--roadmap-only` or `--plans-only`.');
  }

  const isProduction = (process.env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
  if (isProduction && !force && process.env.CMS_PLANNING_SYNC_ALLOW_PRODUCTION !== 'true') {
    throw new Error(
      'Refusing to sync planning content in production. Re-run with `--force` or set CMS_PLANNING_SYNC_ALLOW_PRODUCTION=true.',
    );
  }

  process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';

  const payloadInstance = await payload.init({ config: payloadConfig });
  const logger = payloadInstance.logger?.child({ script: 'planning-sync' }) ?? console;

  const scriptPath = fileURLToPath(import.meta.url);
  const scriptDir = path.dirname(scriptPath);
  const cmsRoot = path.resolve(scriptDir, '..', '..');
  const seedDir = path.join(cmsRoot, 'seed', 'data');

  const roadmapPath = path.join(seedDir, 'roadmap.json');
  const plansPath = path.join(seedDir, 'plans.json');

  const [roadmapSeed, plansSeed] = await Promise.all([
    readSeedJson<RoadmapSeed>(roadmapPath),
    readSeedJson<PlansSeed>(plansPath),
  ]);

  const roadmapTiers = Array.isArray(roadmapSeed.tiers) ? roadmapSeed.tiers : [];
  const plans = Array.isArray(plansSeed.plans) ? plansSeed.plans : [];

  logger.info?.(
    {
      roadmapTiers: roadmapTiers.length,
      plans: plans.length,
      roadmapGeneratedAt: roadmapSeed.generatedAt ?? null,
      plansGeneratedAt: plansSeed.generatedAt ?? null,
      includePlanLinks,
      mode: roadmapOnly ? 'roadmap-only' : plansOnly ? 'plans-only' : 'all',
    },
    '[planning-sync] Loaded seed payloads',
  );

  const roadmapSummary = roadmapOnly || !plansOnly ? await syncRoadmapTiers(payloadInstance, roadmapTiers) : null;
  const plansSummary = plansOnly || !roadmapOnly ? await syncPlans(payloadInstance, plans, { includePlanLinks }) : null;

  logger.info?.(
    {
      roadmap: roadmapSummary,
      plans: plansSummary,
    },
    '[planning-sync] Completed sync',
  );

  await payloadInstance.db?.destroy?.().catch(() => null);
};

const findFirst = async (
  payloadInstance: any,
  collection: string,
  where: Record<string, unknown>,
): Promise<any | null> => {
  const result = await payloadInstance.find({
    collection,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return (result.docs[0] as any | undefined) ?? null;
};

const syncRoadmapTiers = async (payloadInstance: any, tiers: RoadmapTierSeed[]): Promise<UpsertSummary> => {
  const summary: UpsertSummary = { created: 0, updated: 0, skipped: 0 };
  if (!tiers.length) return summary;

  for (const tier of tiers) {
    const tierId = typeof tier.id === 'string' ? tier.id.trim() : '';
    if (!tierId) {
      summary.skipped += 1;
      continue;
    }

    const items = Array.isArray(tier.items) ? tier.items : [];

    const payloadData: Record<string, any> = {
      tierId,
      tier: tier.tier ?? tierId,
      title: tier.title ?? tierId,
      description: tier.description ?? null,
      focus: tier.focus ?? null,
      statusSummary: tier.statusSummary ?? null,
      items: items.map((item, index) => ({
        code: item.code ?? item.id ?? `roadmap-item-${index + 1}`,
        title: item.title ?? `Roadmap item ${index + 1}`,
        summary: item.summary ?? null,
        status: item.status ?? 'queued',
        cloudStatus: item.cloudStatus ?? 'pending',
        referenceLabel: item.referenceLabel ?? null,
        referenceUrl: item.referenceUrl ?? null,
        plan: item.plan
          ? {
              title: item.plan.title ?? null,
              owner: item.plan.owner ?? null,
              path: item.plan.path ?? null,
              status: item.plan.status ?? null,
              cloudStatus: item.plan.cloudStatus ?? null,
            }
          : null,
      })),
    };

    const existing = await findFirst(payloadInstance, 'roadmap-tiers', {
      tierId: { equals: tierId },
    });

    if (existing?.id != null) {
      await payloadInstance.update({
        collection: 'roadmap-tiers',
        id: existing.id,
        data: payloadData,
        overrideAccess: true,
      });
      summary.updated += 1;
      continue;
    }

    await payloadInstance.create({
      collection: 'roadmap-tiers',
      data: payloadData,
      draft: false,
      overrideAccess: true,
    });
    summary.created += 1;
  }

  return summary;
};

const syncPlans = async (
  payloadInstance: any,
  plans: PlanSeed[],
  options: { includePlanLinks: boolean },
): Promise<UpsertSummary> => {
  const summary: UpsertSummary = { created: 0, updated: 0, skipped: 0 };
  if (!plans.length) return summary;

  const includePlanLinks = Boolean(options.includePlanLinks);

  for (const plan of plans) {
    const planId = typeof plan.id === 'string' ? plan.id.trim() : '';
    const slug = typeof plan.slug === 'string' && plan.slug.trim().length > 0 ? plan.slug.trim() : planId;
    if (!planId || !slug) {
      summary.skipped += 1;
      continue;
    }

    payloadInstance.logger?.info?.({ planId, slug, includePlanLinks }, '[planning-sync] Syncing plan');

    const payloadData: Record<string, any> = {
      planId,
      slug,
      title: plan.title ?? planId,
      owner: plan.owner ?? null,
      tier: plan.tier ?? 'meta',
      status: plan.status ?? 'queued',
      cloudStatus: plan.cloudStatus ?? 'pending',
      summary: plan.summary ?? null,
      lastUpdated: plan.lastUpdated ?? null,
      path: plan.path ?? null,
      body: plan.body ?? [],
    };

    if (includePlanLinks) {
      payloadData.links = (plan.links ?? []).map((link) => ({
        label: link.label ?? link.url,
        url: link.url,
      }));
    }

    const existing =
      (await findFirst(payloadInstance, 'plans', { planId: { equals: planId } })) ??
      (await findFirst(payloadInstance, 'plans', { slug: { equals: slug } }));

    if (existing?.id != null) {
      await payloadInstance.update({
        collection: 'plans',
        id: existing.id,
        data: payloadData,
        overrideAccess: true,
      });
      summary.updated += 1;
      continue;
    }

    await payloadInstance.create({
      collection: 'plans',
      data: payloadData,
      draft: false,
      overrideAccess: true,
    });
    summary.created += 1;
  }

  return summary;
};

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[planning-sync] Fatal error', error);
    process.exitCode = 1;
  })
  .finally(() => {
    setImmediate(() => process.exit(process.exitCode ?? 0));
  });
