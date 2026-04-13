// @ts-nocheck
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import payload from 'payload';
import sanitizeHtml from 'sanitize-html';
import payloadConfig from '../../payload.config.ts';
import { seedUsers } from '../scripts/seedUsers';
import { pageDefinitions } from './pageDefinitions';
import { slugify } from '../../app/api/_lib/slugs.ts';
import { normalizeFlightPlanSlideInputs, type FlightPlanGallerySlide } from '../../app/api/_lib/content.ts';
import { formatLogTitle, parseLogTitle } from '../utils/logTitles';
import {
  TIMESTAMP_SLUG_PATTERN,
  buildLogPath,
  deriveCallSignToken,
  formatTimestamp,
  timestampSlugToDate,
} from '@astralpirates/shared/logs';
import { ensureOwnerMembership, normaliseId as normalizeRecordId } from '@/app/api/_lib/flightPlanMembers';
import { buildMissionTaskFixtures } from './taskFixtures';
import { DEFAULT_TEST_RUN_CADENCE } from '../constants/testRunCadences';
import { closeFlightPlanMembershipQueue } from '../queues/flightPlanMembershipQueue';
import { CMS_SEED_PROFILE, CMS_SEED_TESTCASE, IS_DUMMY_SEED_PROFILE, crewProfiles } from '../scripts/crewProfiles';
import { seedTestFixtures } from '../scripts/seedTestFixtures';
import { maybeRunElsaTopUp } from '../scripts/runElsaTopUp';
import { formatElsaTopUpSummary } from '../workers/elsaTopUpHelpers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const dataDir = path.join(projectRoot, 'seed', 'data');

const readJSON = async <T>(name: string): Promise<T> => {
  const filePath = path.join(dataDir, `${name}.json`);
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
};

type SeedableCollection = 'pages' | 'flight-plans' | 'logs' | 'roadmap-tiers' | 'plans';

type SeedLexicalTextNode = {
  type: 'text';
  text: string;
  version: 1;
  detail: 0;
  format: 0;
  mode: 'normal';
  style: '';
};

type SeedLexicalParagraphNode = {
  type: 'paragraph';
  format: '';
  indent: 0;
  version: 1;
  direction: 'ltr';
  children: SeedLexicalTextNode[];
};

type SeedLexicalDocument = {
  root: {
    type: 'root';
    format: '';
    indent: 0;
    version: 1;
    direction: 'ltr';
    children: SeedLexicalParagraphNode[];
  };
};

const normaliseHeadline = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const toParagraphs = (value: string): SeedLexicalParagraphNode[] => {
  const segments = value
    .split(/\r?\n{2,}/)
    .map((segment) => segment.replace(/\r?\n/g, ' ').trim())
    .filter((segment) => segment.length > 0);

  if (!segments.length) {
    return [
      {
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        children: [
          {
            type: 'text',
            text: '',
            version: 1,
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
          },
        ],
      },
    ];
  }

  return segments.map<SeedLexicalParagraphNode>((segment) => ({
    type: 'paragraph',
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr',
    children: [
      {
        type: 'text',
        text: segment,
        version: 1,
        detail: 0,
        format: 0,
        mode: 'normal',
        style: '',
      },
    ],
  }));
};

const normalizeHtmlLineBreaks = (value: string): string =>
  value
    .replaceAll('<br>', '\n')
    .replaceAll('<br/>', '\n')
    .replaceAll('<br />', '\n')
    .replaceAll('</p>', '\n\n')
    .replaceAll('</div>', '\n\n')
    .replaceAll('</section>', '\n\n')
    .replaceAll('</article>', '\n\n');

const htmlToLexicalDocument = (value: unknown): SeedLexicalDocument => {
  const normalised = typeof value === 'string' ? normalizeHtmlLineBreaks(value) : '';

  const plain = sanitizeHtml(normalised, {
    allowedTags: [],
    allowedAttributes: {},
  });

  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: toParagraphs(plain),
    },
  };
};

const findFirst = async <T = any>(collection: string, where: Record<string, unknown>): Promise<T | null> => {
  const result = await payload.find({
    collection,
    where,
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return (result.docs[0] as T | undefined) ?? null;
};

type UpsertResult = {
  id: number | string;
  action: 'created' | 'updated';
};

const upsertSeedDocument = async (options: {
  collection: SeedableCollection;
  where: Record<string, unknown>;
  data: Record<string, unknown>;
}): Promise<UpsertResult> => {
  const existing = await findFirst(options.collection, options.where);

  if (existing?.id != null) {
    const updated = await payload.update({
      collection: options.collection,
      id: existing.id,
      data: options.data,
      overrideAccess: true,
    });
    payload.logger.info({ collection: options.collection, id: updated.id }, 'Seeded document (updated)');
    return { id: updated.id, action: 'updated' };
  }

  const created = await payload.create({
    collection: options.collection,
    data: options.data,
    draft: false,
    overrideAccess: true,
  });
  payload.logger.info({ collection: options.collection, id: created.id }, 'Seeded document (created)');
  return { id: created.id, action: 'created' };
};

type FlightPlanGallerySlideSeed = Partial<FlightPlanGallerySlide> & {
  imageUrl?: string | null;
  imageAlt?: string | null;
};

interface FlightPlanSeed extends Record<string, unknown> {
  title: string;
  slug: string;
  path: string;
  parent?: string | null;
  summary: string;
  location: string;
  dateCode: string;
  displayDate: string;
  eventDate: string | null;
  listOrder: number | null;
  isPublic?: boolean;
  body: string | SeedLexicalDocument;
  gallerySlides?: FlightPlanGallerySlideSeed[];
}

interface LogSeed {
  slug?: string | null;
  path?: string | null;
  dateCode?: string | null;
  logDate?: string | null;
  body: string;
  ownerEmail?: string | null;
  note?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

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

type PlanLinkSeed = {
  label?: string | null;
  url?: string | null;
};

type PlanSeed = {
  id: string;
  slug?: string | null;
  title: string;
  owner?: string | null;
  tier?: string | null;
  status?: string | null;
  cloudStatus?: string | null;
  summary?: string | null;
  lastUpdated?: string | null;
  path?: string | null;
  links?: PlanLinkSeed[] | null;
  body?: any;
};

type PlansSeed = {
  generatedAt?: string | null;
  plans?: PlanSeed[];
};

const normaliseSeeds = <T extends Record<string, unknown>>(items: T[]): T[] =>
  items.map((item) => {
    const entries = Object.entries(item).map(([key, value]) => {
      if (value === null) return [key, undefined];
      return [key, value];
    });
    return Object.fromEntries(entries) as T;
  });

type UpsertSummary = {
  created: number;
  updated: number;
  skipped?: number;
};

type PageSeed = ((typeof pageDefinitions)[number] & { path: string }) | (Record<string, unknown> & { path: string });
type FlightPlanSeedRecord = FlightPlanSeed & { slug: string; path: string };

const shouldOverwritePages = process.env.CMS_SEED_ALLOW_PAGE_OVERWRITE === 'true';
const seedTaskFixtures = process.env.CMS_SEED_INCLUDE_TASKS === 'true';

const syncPages = async (pages: PageSeed[]): Promise<UpsertSummary> => {
  const summary: UpsertSummary = { created: 0, updated: 0, skipped: 0 };
  for (const page of pages) {
    const existing = await findFirst('pages', {
      path: {
        equals: page.path,
      },
    });

    if (existing?.id != null) {
      if (!shouldOverwritePages) {
        payload.logger.info(
          { collection: 'pages', id: existing.id, path: page.path },
          'Seed skipped (existing page)',
        );
        summary.skipped = (summary.skipped ?? 0) + 1;
        continue;
      }

      await payload.update({
        collection: 'pages',
        id: existing.id,
        data: page,
        overrideAccess: true,
      });
      summary.updated += 1;
      continue;
    }

    await payload.create({
      collection: 'pages',
      data: page,
      draft: false,
      overrideAccess: true,
    });
    summary.created += 1;
  }
  return summary;
};

const syncFlightPlans = async (plans: FlightPlanSeedRecord[]): Promise<UpsertSummary> => {
  const summary: UpsertSummary = { created: 0, updated: 0 };
  for (const plan of plans) {
    const result = await upsertSeedDocument({
      collection: 'flight-plans',
      where: {
        slug: {
          equals: plan.slug,
        },
      },
      data: plan,
    });
    if (result.action === 'created') {
      summary.created += 1;
    } else {
      summary.updated += 1;
    }
  }
  return summary;
};

const splitSegments = (value: unknown): string[] => {
  if (typeof value !== 'string') return [];
  return value
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
};

const normaliseFlightPlan = (plan: FlightPlanSeed): FlightPlanSeed => {
  const slugSegments = splitSegments(plan.slug);
  const pathSegments = splitSegments(plan.path);
  const parentSegments = splitSegments(plan.parent);
  const isPublic = typeof plan.isPublic === 'boolean' ? plan.isPublic : true;
  const category =
    typeof (plan as any).category === 'string' && ['test', 'project', 'event'].includes((plan as any).category)
      ? (plan as any).category
      : 'project';

  const slugCandidate =
    slugSegments.at(-1) ?? pathSegments.at(-1) ?? parentSegments.at(-1) ?? plan.title ?? plan.dateCode ?? 'flight-plan';
  const safeSlug = slugify(String(slugCandidate || 'flight-plan'));

  const baseSegments = pathSegments.length > 0 ? pathSegments : parentSegments;
  const leadingSegments = baseSegments.length > 0 ? baseSegments.slice(0, -1) : baseSegments;
  const filteredLeading = leadingSegments.filter((segment) => {
    if (!segment) return false;
    const cleaned = segment.toLowerCase();
    if (cleaned === 'flight-plans' || cleaned === 'events') return false;
    return true;
  });

  const finalPathSegments = ['flight-plans', ...filteredLeading, safeSlug];

  return {
    ...plan,
    slug: safeSlug,
    path: finalPathSegments.join('/'),
    isPublic,
    category,
    body: htmlToLexicalDocument(plan.body),
    gallerySlides: normalizeFlightPlanSlideInputs(plan.gallerySlides ?? []),
  };
};

const buildTestFlightPlanSeed = (testcase: string): FlightPlanSeed => {
  const trimmed = testcase.trim().toLowerCase();
  const safeCase = trimmed.length ? trimmed : 'roles';
  const slug = slugify(`test-${safeCase}`);
  return {
    title: `Testcase: ${safeCase}`,
    slug,
    path: slug,
    parent: 'flight-plans',
    category: 'test',
    summary: `Manual test plan for ${safeCase}`,
    location: 'Local development',
    dateCode: safeCase,
    displayDate: 'Local',
    eventDate: null,
    listOrder: null,
    isPublic: false,
    body: `Manual test plan "${safeCase}" with one task per test variant.`,
    gallerySlides: [],
  };
};

const normaliseLogSeed = (log: LogSeed): LogSeed => ({
  slug: typeof log.slug === 'string' && log.slug.trim().length ? log.slug.trim() : undefined,
  path: typeof log.path === 'string' && log.path.trim().length ? log.path.trim() : undefined,
  dateCode: typeof log.dateCode === 'string' && log.dateCode.trim().length ? log.dateCode.trim() : undefined,
  logDate: log.logDate ? new Date(log.logDate).toISOString() : undefined,
  body: typeof log.body === 'string' ? log.body : '',
  ownerEmail: typeof log.ownerEmail === 'string' && log.ownerEmail.trim().length ? log.ownerEmail.trim().toLowerCase() : undefined,
  note: typeof log.note === 'string' && log.note.trim().length ? log.note.trim() : undefined,
  createdAt: log.createdAt ? new Date(log.createdAt).toISOString() : undefined,
  updatedAt: log.updatedAt ? new Date(log.updatedAt).toISOString() : undefined,
});

const ROADMAP_TIERS = new Set(['tier1', 'tier2', 'tier3']);
const ROADMAP_STATUSES = new Set(['queued', 'active', 'shipped', 'tested', 'canceled']);
const ROADMAP_CLOUD_STATUSES = new Set(['pending', 'deploying', 'healthy']);
const PLAN_STATUSES = new Set(['queued', 'active', 'shipped', 'tested', 'canceled']);
const PLAN_CLOUD_STATUSES = new Set(['pending', 'deploying', 'healthy']);

const normaliseNullableString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normaliseEnum = (value: unknown, allowed: Set<string>, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().toLowerCase();
  if (allowed.has(trimmed)) return trimmed;
  return fallback;
};

const normaliseRoadmapPlan = (plan: RoadmapPlanSeed | null | undefined): RoadmapPlanSeed | null => {
  if (!plan) return null;
  const title = normaliseNullableString(plan.title);
  const path = normaliseNullableString(plan.path);
  const owner = normaliseNullableString(plan.owner);
  const status = normaliseNullableString(plan.status);
  const cloudStatus = normaliseNullableString(plan.cloudStatus);
  if (!title && !owner && !path && !status && !cloudStatus && !plan.id) return null;

  return {
    id: normaliseNullableString(plan.id),
    title: title ?? undefined,
    owner: owner ?? undefined,
    path: path ?? undefined,
    status: status ? normaliseEnum(status, ROADMAP_STATUSES, 'queued') : undefined,
    cloudStatus: cloudStatus ? normaliseEnum(cloudStatus, ROADMAP_CLOUD_STATUSES, 'pending') : undefined,
  };
};

const normaliseRoadmapItem = (item: RoadmapItemSeed): RoadmapItemSeed => {
  const code = normaliseNullableString(item.code ?? item.id) ?? normaliseNullableString(item.title) ?? 'roadmap-item';
  const title = normaliseNullableString(item.title) ?? 'Roadmap item';
  const summary = normaliseNullableString(item.summary) ?? undefined;
  const status = normaliseEnum(item.status, ROADMAP_STATUSES, 'queued');
  const cloudStatus = normaliseEnum(item.cloudStatus, ROADMAP_CLOUD_STATUSES, 'pending');
  const referenceLabel = normaliseNullableString(item.referenceLabel) ?? undefined;
  const referenceUrl = normaliseNullableString(item.referenceUrl) ?? undefined;
  const plan = normaliseRoadmapPlan(item.plan);

  return {
    ...item,
    code,
    title,
    summary,
    status,
    cloudStatus,
    referenceLabel,
    referenceUrl,
    plan: plan ?? undefined,
  };
};

const normaliseRoadmapTier = (tier: RoadmapTierSeed): RoadmapTierSeed => {
  const tierId = normaliseNullableString(tier.id) ?? 'tier';
  const tierKey = normaliseNullableString(tier.tier) ?? tierId;
  const description = normaliseNullableString(tier.description) ?? undefined;
  const focus = normaliseNullableString(tier.focus) ?? undefined;
  const statusSummary = normaliseNullableString(tier.statusSummary) ?? undefined;
  const items = Array.isArray(tier.items) ? tier.items.map(normaliseRoadmapItem) : [];

  return {
    ...tier,
    id: tierId,
    tier: normaliseEnum(tierKey, ROADMAP_TIERS, tierId),
    title: normaliseNullableString(tier.title) ?? tierId,
    description,
    focus,
    statusSummary,
    items,
  };
};

const normalisePlanLinkSeed = (link: PlanLinkSeed | null | undefined): PlanLinkSeed | null => {
  if (!link) return null;
  const url = normaliseNullableString(link.url);
  const label = normaliseNullableString(link.label);
  if (!url) return null;
  return {
    label: label ?? url,
    url,
  };
};

const normalisePlanSeed = (plan: PlanSeed): PlanSeed => {
  const id = normaliseNullableString(plan.id) ?? 'plan';
  const slug = normaliseNullableString(plan.slug) ?? id;
  const title = normaliseNullableString(plan.title) ?? id;
  const owner = normaliseNullableString(plan.owner);
  const tier = normaliseNullableString(plan.tier) ?? 'meta';
  const status = normaliseEnum(plan.status, PLAN_STATUSES, 'queued');
  const cloudStatus = normaliseEnum(plan.cloudStatus, PLAN_CLOUD_STATUSES, 'pending');
  const summary = normaliseNullableString(plan.summary) ?? undefined;
  const lastUpdated = normaliseNullableString(plan.lastUpdated) ?? undefined;
  const pathValue = normaliseNullableString(plan.path) ?? undefined;
  const links = Array.isArray(plan.links)
    ? plan.links.map(normalisePlanLinkSeed).filter(Boolean)
    : undefined;

  const body =
    Array.isArray(plan.body) || plan.body === undefined || plan.body === null
      ? plan.body ?? []
      : [];

  return {
    ...plan,
    id,
    slug,
    title,
    owner: owner ?? undefined,
    tier,
    status,
    cloudStatus,
    summary,
    lastUpdated,
    path: pathValue,
    links,
    body,
  };
};

const captainProfileEmail =
  process.env.CMS_SEED_CAPTAIN_EMAIL ??
  crewProfiles.find((member) => member.role === 'captain')?.email ??
  'captain@example.com';

const normaliseEmail = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed.length) return null;
  return trimmed;
};

const resolveOwnerEmail = (value?: string | null): string => {
  const normalized = normaliseEmail(value) ?? captainProfileEmail;
  if (CMS_SEED_PROFILE === 'dummy') {
    return captainProfileEmail;
  }
  return normalized;
};

const resolveCrewMemberByEmail = async (
  email: string,
  cache: Map<string, any>,
): Promise<any | null> => {
  const cached = cache.get(email);
  if (cached) return cached;

  const result = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: email,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const doc = result.docs[0] ?? null;
  if (doc) {
    cache.set(email, doc);
  }
  return doc;
};

const seedMissionTasksForPlans = async (plans: FlightPlanSeedRecord[]) => {
  let seededPlans = 0;
  let createdTasks = 0;
  let skipped = 0;

  for (const planSeed of plans) {
    const planDoc = await findFirst('flight-plans', {
      slug: {
        equals: planSeed.slug,
      },
    });
    const planId = normalizeRecordId(planDoc?.id);
    const ownerId = normalizeRecordId((planDoc as Record<string, unknown> | undefined)?.owner);
    if (planId == null || ownerId == null) {
      skipped += 1;
      continue;
    }

    const existingTasks = await payload.find({
      collection: 'flight-plan-tasks',
      where: {
        flightPlan: {
          equals: planId,
        },
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (existingTasks.docs.length > 0) {
      skipped += 1;
      continue;
    }

    const ownerMembership = await ensureOwnerMembership({
      payload,
      flightPlanId: planId,
      ownerId,
    });
    if (!ownerMembership) {
      skipped += 1;
      continue;
    }

    const fixtures = buildMissionTaskFixtures(
      (planDoc as Record<string, unknown> | undefined)?.title as string | undefined,
    );
    const baseTime = Date.now();
    for (const fixture of fixtures) {
      await payload.create({
        collection: 'flight-plan-tasks',
        data: {
          flightPlan: planId,
          ownerMembership: ownerMembership.id,
          title: fixture.title,
          description: htmlToLexicalDocument(fixture.description),
          state: fixture.state,
          listOrder: baseTime + fixture.order,
          assigneeMembershipIds: [],
        },
        draft: false,
        overrideAccess: true,
      });
      createdTasks += 1;
    }
    seededPlans += 1;
  }

  return { seededPlans, createdTasks, skipped };
};

type TestPlanTaskSummary = {
  planSlug: string;
  tasksCreated: number;
  membershipsTouched: number;
  skippedUsers: number;
  skippedExistingTasks: boolean;
  planMissing: boolean;
};

const upsertCrewMembership = async ({
  flightPlanId,
  userId,
  invitedById,
}: {
  flightPlanId: number;
  userId: number;
  invitedById: number | null;
}) => {
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

  const targetInvitedBy = invitedById ?? userId;

  if (existing.docs[0]) {
    const membershipId = normalizeRecordId(existing.docs[0].id);
    if (membershipId == null) return null;
    const updated = await payload.update({
      collection: 'flight-plan-memberships',
      id: membershipId,
      data: {
        role: 'crew',
        invitationStatus: 'accepted',
        invitedBy: targetInvitedBy,
        invitedAt:
          typeof (existing.docs[0] as { invitedAt?: unknown }).invitedAt === 'string'
            ? (existing.docs[0] as { invitedAt?: string }).invitedAt
            : nowIso,
        respondedAt: nowIso,
      },
      overrideAccess: true,
    });
    return normalizeRecordId(updated.id);
  }

  const created = await payload.create({
    collection: 'flight-plan-memberships',
    data: {
      flightPlan: flightPlanId,
      user: userId,
      role: 'crew',
      invitationStatus: 'accepted',
      invitedBy: targetInvitedBy,
      invitedAt: nowIso,
      respondedAt: nowIso,
    },
    draft: false,
    overrideAccess: true,
  });
  return normalizeRecordId(created.id);
};

const seedTestPlanTasks = async (
  planSlug: string,
  testcase: string,
  testPassword: string,
): Promise<TestPlanTaskSummary> => {
  const manualTestCases: Array<{ title: string; description: string }> = [
    {
      title: 'flightplan/create',
      description:
        'Log in as user flightplan.create@astralpirates.com using the configured seed password. Go to /bridge/flight-plans and create a new flight plan.',
    },
    {
      title: 'flightplan/invite',
      description:
        'Log in as user flightplan.invite@astralpirates.com using the configured seed password. Go to /bridge/flight-plans and send a flight plan invite.',
    },
    {
      title: 'flightplan/acceptinvite',
      description:
        'Log in as user flightplan.acceptinvite@astralpirates.com using the configured seed password. Accept a pending flight plan invite from the bridge.',
    },
    {
      title: 'flightplan/promotetocroewascaptain',
      description:
        'Log in as user flightplan.promotetocroewascaptain@astralpirates.com using the configured seed password. Promote a crew organiser to captain for the mission.',
    },
    {
      title: 'flightplan/promotetocewascrew',
      description:
        'Log in as user flightplan.promotetocewascrew@astralpirates.com using the configured seed password. Promote an invited passenger to crew organiser.',
    },
    {
      title: 'flightplan/visible',
      description:
        'Log in as user flightplan.visible@astralpirates.com using the configured seed password. Toggle the mission visibility to Public and verify roster access.',
    },
    {
      title: 'flightplan/hidden',
      description:
        'Log in as user flightplan.hidden@astralpirates.com using the configured seed password. Toggle the mission visibility to Private and confirm only crew can see it.',
    },
    {
      title: 'log/create',
      description:
        'Log in as user log.create@astralpirates.com using the configured seed password. Create a new log entry from the logbook.',
    },
    {
      title: 'log/read',
      description:
        'Log in as user log.read@astralpirates.com using the configured seed password. Open the logbook and verify you can read existing log entries.',
    },
    {
      title: 'flightplan-task/create',
      description:
        'Log in as user flightplan-task.create@astralpirates.com using the configured seed password. Create a new mission task on the test plan.',
    },
    {
      title: 'flightplan-task/invite',
      description:
        'Log in as user flightplan-task.invite@astralpirates.com using the configured seed password. Invite a crew member to the mission and assign them a task.',
    },
    {
      title: 'flightplan-task/selfasign',
      description:
        'Log in as user flightplan-task.selfasign@astralpirates.com using the configured seed password. Claim an existing mission task by assigning it to yourself.',
    },
  ];

  const summary: TestPlanTaskSummary = {
    planSlug,
    tasksCreated: 0,
    membershipsTouched: 0,
    skippedUsers: 0,
    skippedExistingTasks: false,
    planMissing: false,
  };

  const planDoc = await findFirst('flight-plans', {
    slug: {
      equals: planSlug,
    },
  });
  const planId = normalizeRecordId(planDoc?.id);
  if (planId == null) {
    summary.planMissing = true;
    return summary;
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
  summary.skippedExistingTasks = existingTasks.docs.length > 0;
  const existingTitles = new Set(
    existingTasks.docs
      .map((task) => (typeof (task as any)?.title === 'string' ? (task as any).title.toLowerCase() : ''))
      .filter((title) => title.length > 0),
  );

  const ownerId = normalizeRecordId((planDoc as Record<string, unknown> | undefined)?.owner);
  const ownerMembership = ownerId
    ? await ensureOwnerMembership({
        payload,
        flightPlanId: planId,
        ownerId,
      })
    : null;
  const inviterId = ownerId ?? ownerMembership?.userId ?? null;

  const userCache = new Map<string, any>();
  const baseTime = Date.now();
  const membershipByUserId = new Map<number, number>();
  if (ownerMembership?.id != null && ownerId != null) {
    membershipByUserId.set(ownerId, ownerMembership.id);
  }

  for (const profile of crewProfiles) {
    const userDoc = await resolveCrewMemberByEmail(profile.email, userCache);
    const userId = normalizeRecordId(userDoc?.id);
    if (userId == null) {
      summary.skippedUsers += 1;
      continue;
    }

    let membershipId: number | null = null;
    const isOwnerUser = ownerId != null && userId === ownerId;
    if (membershipByUserId.has(userId)) {
      membershipId = membershipByUserId.get(userId) ?? null;
    } else {
      if (isOwnerUser && ownerMembership?.id != null) {
        membershipId = ownerMembership.id;
      } else {
        membershipId = await upsertCrewMembership({
          flightPlanId: planId,
          userId,
          invitedById: inviterId,
        });
        if (membershipId != null) {
          summary.membershipsTouched += 1;
        }
      }
      if (membershipId != null) {
        membershipByUserId.set(userId, membershipId);
      }
    }

    if (membershipId == null) {
      summary.skippedUsers += 1;
      continue;
    }

    const title = `${profile.callSign ?? profile.firstName ?? profile.email} - ${testcase}`;
    const instructions = `Log in as ${profile.email} using the configured seed password and execute the "${testcase}" flow for your variant.`;
    if (!existingTitles.has(title.toLowerCase())) {
      await payload.create({
        collection: 'flight-plan-tasks',
        data: {
          flightPlan: planId,
          ownerMembership: membershipId,
          title,
          description: htmlToLexicalDocument(instructions),
          state: 'ideation',
          testRunCadence: DEFAULT_TEST_RUN_CADENCE,
          listOrder: baseTime + summary.tasksCreated,
          assigneeMembershipIds: [membershipId],
        },
        draft: false,
        overrideAccess: true,
      });
      summary.tasksCreated += 1;
      existingTitles.add(title.toLowerCase());
    }
  }

  const defaultMembershipId =
    ownerMembership?.id ??
    (membershipByUserId.size ? Array.from(membershipByUserId.values())[0] ?? null : null);
  for (const testCase of manualTestCases) {
    const normalizedTitle = testCase.title.trim().toLowerCase();
    if (!normalizedTitle || existingTitles.has(normalizedTitle)) {
      continue;
    }
    if (defaultMembershipId == null) {
      summary.skippedUsers += 1;
      continue;
    }
    await payload.create({
      collection: 'flight-plan-tasks',
      data: {
        flightPlan: planId,
        ownerMembership: defaultMembershipId,
        title: testCase.title,
        description: htmlToLexicalDocument(testCase.description),
        state: 'ideation',
        testRunCadence: DEFAULT_TEST_RUN_CADENCE,
        listOrder: baseTime + summary.tasksCreated + manualTestCases.indexOf(testCase),
        assigneeMembershipIds: [defaultMembershipId],
      },
      draft: false,
      overrideAccess: true,
    });
    summary.tasksCreated += 1;
    existingTitles.add(normalizedTitle);
  }

  return summary;
};

type LogSyncSummary = UpsertSummary & { skipped: number };

const syncLogsCollection = async (logs: LogSeed[]): Promise<LogSyncSummary> => {
  const summary: LogSyncSummary = { created: 0, updated: 0, skipped: 0 };
  if (!logs.length) return summary;

  const ownerCache = new Map<string, any>();

  for (const entry of logs) {
    const ownerEmail = resolveOwnerEmail(entry.ownerEmail);
    const ownerDoc = await resolveCrewMemberByEmail(ownerEmail, ownerCache);
    if (!ownerDoc) {
      payload.logger.warn({ ownerEmail }, 'Skipping log seed - owner not found');
      summary.skipped++;
      continue;
    }

    const ownerId = ownerDoc.id;
    let slug = entry.slug ?? null;
    const baseDate =
      (entry.logDate ? new Date(entry.logDate) : null)
      ?? (entry.createdAt ? new Date(entry.createdAt) : null)
      ?? new Date();

    let resolvedDate =
      slug && TIMESTAMP_SLUG_PATTERN.test(slug) ? timestampSlugToDate(slug) ?? baseDate : baseDate;
    if (!resolvedDate || Number.isNaN(resolvedDate.getTime())) {
      resolvedDate = new Date();
    }

    let stamp =
      entry.dateCode && TIMESTAMP_SLUG_PATTERN.test(entry.dateCode)
        ? entry.dateCode
        : formatTimestamp(resolvedDate);

    if (!slug || !slug.trim().length) {
      slug = stamp;
    }

    let existingDoc: any = null;
    if (slug) {
      existingDoc = await findFirst('logs', {
        slug: {
          equals: slug,
        },
      });
    }
    if (!existingDoc && entry.path) {
      existingDoc = await findFirst('logs', {
        path: {
          equals: entry.path,
        },
      });
      if (existingDoc?.slug) {
        slug = existingDoc.slug;
      }
    }

    if (!existingDoc) {
      // Ensure slug uniqueness by bumping the timestamp if needed.
      let conflict = await findFirst('logs', {
        slug: {
          equals: slug,
        },
      });
      while (conflict) {
        resolvedDate = new Date(resolvedDate.getTime() + 1000);
        stamp = formatTimestamp(resolvedDate);
        slug = stamp;
        conflict = await findFirst('logs', {
          slug: {
            equals: slug,
          },
        });
      }
    }

    const finalSlug = existingDoc?.slug ?? slug;
    const finalStamp = existingDoc?.dateCode ?? stamp;
    const existingLogDate = existingDoc?.logDate ? new Date(existingDoc.logDate) : null;
    const logDateIso = (
      entry.logDate
        ? new Date(entry.logDate)
        : existingLogDate
    )?.toISOString() ?? resolvedDate.toISOString();
    const path = existingDoc?.path ?? entry.path ?? buildLogPath(finalSlug);
    const existingDocHeadline = normaliseHeadline(existingDoc?.headline);
    const existingTitleNote =
      existingDoc?.title ? normaliseHeadline(parseLogTitle(existingDoc.title).note) : null;
    const existingNote = existingDocHeadline ?? existingTitleNote;
    const callSignToken = deriveCallSignToken(ownerDoc);
    const entryNote = normaliseHeadline(entry.note);
    const resolvedHeadline = entryNote ?? existingNote ?? finalStamp;
    const title = formatLogTitle({
      stamp: finalStamp,
      callSign: callSignToken,
      note: resolvedHeadline,
    });

    const payloadData: Record<string, any> = {
      title,
      headline: resolvedHeadline,
      body: entry.body ?? '',
      slug: finalSlug,
      path,
      dateCode: finalStamp,
      logDate: logDateIso,
      owner: ownerId,
    };

    if (!existingDoc && entry.createdAt) {
      payloadData.createdAt = entry.createdAt;
    }
    if (entry.updatedAt) {
      payloadData.updatedAt = entry.updatedAt;
    }

    if (existingDoc?.id != null) {
      const updated = await payload.update({
        collection: 'logs',
        id: existingDoc.id,
        data: payloadData,
        overrideAccess: true,
      });
      payload.logger.info({ collection: 'logs', id: updated.id }, 'Seeded document (updated)');
      summary.updated++;
    } else {
      const created = await payload.create({
        collection: 'logs',
        data: payloadData,
        draft: false,
        overrideAccess: true,
      });
      payload.logger.info({ collection: 'logs', id: created.id }, 'Seeded document (created)');
      summary.created++;
    }
  }

  return summary;
};

const syncPlans = async (plans: PlanSeed[]): Promise<UpsertSummary> => {
  const summary: UpsertSummary = { created: 0, updated: 0, skipped: 0 };
  if (!plans.length) return summary;

  for (const plan of plans) {
    if (!plan.id || !plan.slug) {
      summary.skipped = (summary.skipped ?? 0) + 1;
      continue;
    }

    const payloadData: Record<string, any> = {
      planId: plan.id,
      slug: plan.slug,
      title: plan.title,
      owner: plan.owner ?? null,
      tier: plan.tier,
      status: plan.status,
      cloudStatus: plan.cloudStatus,
      summary: plan.summary ?? null,
      lastUpdated: plan.lastUpdated ?? null,
      path: plan.path ?? null,
      links: plan.links ?? [],
      body: plan.body ?? [],
    };

    const existing = await findFirst('plans', {
      slug: {
        equals: plan.slug,
      },
    });

    if (existing?.id != null) {
      await payload.update({
        collection: 'plans',
        id: existing.id,
        data: payloadData,
        overrideAccess: true,
      });
      summary.updated += 1;
      continue;
    }

    await payload.create({
      collection: 'plans',
      data: payloadData,
      draft: false,
      overrideAccess: true,
    });
    summary.created += 1;
  }

  return summary;
};

type RoadmapSyncSummary = UpsertSummary & { skipped: number };

const syncRoadmapTiers = async (tiers: RoadmapTierSeed[]): Promise<RoadmapSyncSummary> => {
  const summary: RoadmapSyncSummary = { created: 0, updated: 0, skipped: 0 };
  if (!tiers.length) return summary;

  for (const tier of tiers) {
    const tierId = normaliseNullableString(tier.id);
    if (!tierId) {
      summary.skipped++;
      continue;
    }

    const payloadData: Record<string, any> = {
      tierId,
      tier: tier.tier ?? tierId,
      title: tier.title ?? tierId,
      description: tier.description ?? null,
      focus: tier.focus ?? null,
      statusSummary: tier.statusSummary ?? null,
      items: (tier.items ?? []).map((item, index) => ({
        code: item.code ?? `roadmap-item-${index + 1}`,
        title: item.title ?? `Roadmap item ${index + 1}`,
        summary: item.summary ?? null,
        status: item.status ?? 'queued',
        cloudStatus: item.cloudStatus ?? 'pending',
        referenceLabel: item.referenceLabel ?? null,
        referenceUrl: item.referenceUrl ?? null,
        plan: item.plan
          ? {
              id: item.plan.id ?? null,
              title: item.plan.title ?? null,
              owner: item.plan.owner ?? null,
              path: item.plan.path ?? null,
              status: item.plan.status ?? null,
              cloudStatus: item.plan.cloudStatus ?? null,
            }
          : null,
      })),
    };

    const existing = await findFirst('roadmap-tiers', {
      tierId: {
        equals: tierId,
      },
    });

    if (existing?.id != null) {
      await payload.update({
        collection: 'roadmap-tiers',
        id: existing.id,
        data: payloadData,
        overrideAccess: true,
      });
      summary.updated++;
      continue;
    }

    await payload.create({
      collection: 'roadmap-tiers',
      data: payloadData,
      draft: false,
      overrideAccess: true,
    });
    summary.created++;
  }

  return summary;
};

type SeedExecutionOptions = {
  force?: boolean;
};

export const seed = async ({ force = false }: SeedExecutionOptions = {}): Promise<void> => {
  const rawSkipMembership = process.env.CMS_SEED_SKIP_MEMBERSHIP;
  const envSkipFlag = rawSkipMembership === 'true' || rawSkipMembership === '1';
  const envSkipExplicit = rawSkipMembership !== undefined;
  const isProduction = (process.env.NODE_ENV ?? '').toLowerCase() === 'production';
  const skipOwnerBackfill = envSkipExplicit ? envSkipFlag : !isProduction;
  const startedAt = Date.now();
  console.log(`Seed starting at ${new Date(startedAt).toISOString()}`);

  const envAllowsProduction =
    process.env.CMS_SEED_ALLOW_PRODUCTION === 'true' || process.env.CMS_SEED_FORCE === 'true';
  if (isProduction && !force && !envAllowsProduction) {
    throw new Error(
      'Refusing to run content seed in production. Re-run with `--force` or set `CMS_SEED_ALLOW_PRODUCTION=true`.',
    );
  }

  await payload.init({
    config: payloadConfig,
  });

  const testcaseSlug = slugify(`test-${CMS_SEED_TESTCASE}`);
  const testUserPassword = process.env.SEED_DEFAULT_PASSWORD;
  if (!testUserPassword) {
    throw new Error('Set SEED_DEFAULT_PASSWORD before running the content seed.');
  }

  const pages = pageDefinitions.map(({ legacyPaths, notes, ...page }) => page);
  const normalisedPages = normaliseSeeds(pages) as PageSeed[];
  const flightPlans = await readJSON<FlightPlanSeed[]>('flight-plans');
  if (IS_DUMMY_SEED_PROFILE) {
    const hasTestPlan = flightPlans.some((plan) => slugify(String(plan.slug ?? '')).trim() === testcaseSlug);
    if (!hasTestPlan) {
      flightPlans.push(buildTestFlightPlanSeed(CMS_SEED_TESTCASE));
    }
  }
  const normalisedFlightPlans = normaliseSeeds(
    flightPlans.map(normaliseFlightPlan),
  ) as FlightPlanSeedRecord[];
  let roadmapSeed: RoadmapSeed | null = null;
  try {
    roadmapSeed = await readJSON<RoadmapSeed>('roadmap');
  } catch (error: any) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }
  let plansSeed: PlansSeed | null = null;
  try {
    plansSeed = await readJSON<PlansSeed>('plans');
  } catch (error: any) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }
  const normalisedRoadmapTiers = roadmapSeed?.tiers ? roadmapSeed.tiers.map(normaliseRoadmapTier) : [];
  const normalisedPlans = plansSeed?.plans ? plansSeed.plans.map(normalisePlanSeed) : [];
  let logSeeds: LogSeed[] = [];
  try {
    logSeeds = await readJSON<LogSeed[]>('logs');
  } catch (error: any) {
    if (error && error.code !== 'ENOENT') {
      throw error;
    }
  }
  const normalisedLogs = logSeeds.map(normaliseLogSeed);
  const includeTestFixtures =
    process.env.CMS_SEED_INCLUDE_FIXTURES === 'true' || process.env.RUN_TEST_FIXTURES === 'true';

  console.log(
    `Syncing seeded content — pages: ${normalisedPages.length}, flight plans: ${normalisedFlightPlans.length}, roadmap tiers: ${normalisedRoadmapTiers.length}, plans: ${normalisedPlans.length}, logs: ${normalisedLogs.length}`,
  );

  const pageSummary = await syncPages(normalisedPages);
  const flightPlanSummary = await syncFlightPlans(normalisedFlightPlans);
  const roadmapSummary = await syncRoadmapTiers(normalisedRoadmapTiers);
  const plansSummary = await syncPlans(normalisedPlans);
  console.log('Pages seeded', pageSummary);
  console.log('Flight plans seeded', flightPlanSummary);
  console.log('Roadmap tiers seeded', roadmapSummary);
  console.log('Plans seeded', plansSummary);

  console.log(
    `Pages synced — created: ${pageSummary.created}, updated: ${pageSummary.updated}, skipped: ${pageSummary.skipped ?? 0}`,
  );
  console.log(
    `Flight plans synced — created: ${flightPlanSummary.created}, updated: ${flightPlanSummary.updated}`,
  );
  console.log(
    `Roadmap synced — created: ${roadmapSummary.created}, updated: ${roadmapSummary.updated}, skipped: ${roadmapSummary.skipped}`,
  );
  console.log(
    `Plans synced — created: ${plansSummary.created}, updated: ${plansSummary.updated}, skipped: ${plansSummary.skipped ?? 0}`,
  );

  await seedUsers({ skipInit: true, skipShutdown: true });
  console.log('Seeded crew profiles.');

  // Resolve captain for ownership assignment.
  if (skipOwnerBackfill) {
    const reason = envSkipExplicit ? 'CMS_SEED_SKIP_MEMBERSHIP=true' : 'auto-skip outside production environment';
    console.log(`Skipping owner backfill and membership sync (${reason}).`);
  }

  console.log('Resolving captain user for ownership backfill...');
  const captainResult = await payload.find({
    collection: 'users',
    where: {
      email: {
        equals: captainProfileEmail,
      },
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const captain = captainResult.docs[0];

  if (!skipOwnerBackfill && captain?.id != null) {
    console.log('Reassigning existing flight plans to captain...');
    const reassigned = await payload.find({
      collection: 'flight-plans',
      limit: 500,
      depth: 0,
      overrideAccess: true,
    });
    for (const plan of reassigned.docs) {
      if (plan.owner === captain.id) continue;
      await payload.update({
        collection: 'flight-plans',
        id: plan.id,
        data: { owner: captain.id },
        overrideAccess: true,
      });
    }
  } else if (!skipOwnerBackfill) {
    console.warn('Captain user not found; flight plan ownership not assigned.');
  }
  if (!skipOwnerBackfill) {
    console.log('Reassigned flight plan ownership (if captain present).');
  }

  if (IS_DUMMY_SEED_PROFILE) {
    const testPlanTaskSummary = await seedTestPlanTasks(testcaseSlug, CMS_SEED_TESTCASE, testUserPassword);
    console.log(
      `Test plan tasks (${testPlanTaskSummary.planSlug}) — created: ${testPlanTaskSummary.tasksCreated}, memberships touched: ${testPlanTaskSummary.membershipsTouched}, skipped users: ${testPlanTaskSummary.skippedUsers}, existing tasks present: ${testPlanTaskSummary.skippedExistingTasks}, plan missing: ${testPlanTaskSummary.planMissing}`,
    );
  } else {
    console.log('Test plan tasks skipped — dummy seed profile disabled.');
  }

  if (seedTaskFixtures) {
    const taskFixtureSummary = await seedMissionTasksForPlans(normalisedFlightPlans);
    console.log(
      `Mission task fixtures seeded — plans: ${taskFixtureSummary.seededPlans}, tasks: ${taskFixtureSummary.createdTasks}, skipped: ${taskFixtureSummary.skipped}`,
    );
  } else {
    console.log('Mission task fixtures skipped — set CMS_SEED_INCLUDE_TASKS=true to enable them.');
  }

  if (normalisedLogs.length) {
    const logSummary = await syncLogsCollection(normalisedLogs);
    console.log('Logs seeded', logSummary);
    console.log(
      `Logs synced — created: ${logSummary.created}, updated: ${logSummary.updated}, skipped: ${logSummary.skipped}`,
    );
  } else {
    console.log('Logs synced — no seed entries provided.');
  }

  if (includeTestFixtures) {
    const fixtures = await seedTestFixtures({ skipInit: true, skipShutdown: true });
    if (fixtures.skipped) {
      console.log(`[test-fixtures] skipped during seed (${fixtures.reason ?? 'guard'})`);
    } else {
      console.log(
        `[test-fixtures] log: ${fixtures.logCreated ? 'created' : 'updated'} (${fixtures.logSlug}), baseline tasks created: ${fixtures.tasksCreated}`,
      );
    }
  } else {
    console.log('Test fixtures skipped — set CMS_SEED_INCLUDE_FIXTURES=true (or RUN_TEST_FIXTURES=true) to enable them during seed.');
  }

  const topUpResult = await maybeRunElsaTopUp({ payload, skipInit: true, skipShutdown: true });
  if (topUpResult.skipped) {
    console.log(`[elsa-top-up] skipped (${topUpResult.reason})`);
  } else {
    console.log(formatElsaTopUpSummary(topUpResult.summary));
  }

  await closeFlightPlanMembershipQueue();
  console.log('Closed membership queue.');

  const lifecycle = payload as unknown as {
    close?: () => Promise<void> | void;
    shutdown?: () => Promise<void> | void;
  };
  if (typeof lifecycle.close === 'function') {
    await lifecycle.close();
  } else if (typeof lifecycle.shutdown === 'function') {
    await lifecycle.shutdown();
  }

  const finishedAt = Date.now();
  const elapsedMs = finishedAt - startedAt;
  console.log(`Seed completed in ${Math.round(elapsedMs)}ms.`);
};

export default seed;

const isDirectExecution = (() => {
  if (typeof process === 'undefined' || typeof import.meta?.url !== 'string') return false;
  const executedPath = process.argv[1];
  if (!executedPath) return false;
  const fileUrl = new URL(`file://${executedPath}`).href;
  return fileUrl === import.meta.url;
})();

if (isDirectExecution) {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const timeoutMs = Number.parseInt(process.env.CMS_SEED_EXIT_TIMEOUT_MS ?? '600000', 10);
  const exitTimer =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
          console.error(`Seed timed out after ${timeoutMs}ms; forcing exit with code 1.`);
          process.exit(1);
        }, timeoutMs).unref()
      : null;

  const exit = (code: number) => {
    if (exitTimer) {
      clearTimeout(exitTimer);
    }
    // Forceful exit to avoid lingering esbuild/file watcher handles during dockerized runs.
    process.exit(code);
  };

  seed({ force })
    .then(() => exit(0))
    .catch((error) => {
      console.error(error);
      exit(1);
    });
}
