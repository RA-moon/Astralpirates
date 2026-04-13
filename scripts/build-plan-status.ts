import { promises as fs } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import yaml from 'js-yaml';

import { fetchPlansFromCms } from '../shared/plans';
import {
  createPlansSnapshotPayload,
  writePlansSnapshotPayload as writePlansSnapshotFiles,
} from './lib/plans-snapshot';

const titleCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

type PlanMeta = {
  type: 'plan';
  id: string;
  title: string;
  owner: string;
  tier: string;
  status: string;
  cloudStatus: string;
  lastUpdated: string;
  summary?: string;
  links?: PlanLink[];
};

type RoadmapMeta = {
  type: 'roadmap';
  tierDescriptions?: Record<string, string>;
};

type MetaBlock = PlanMeta | RoadmapMeta | { type: string };

type RunLogMeta = {
  type: 'run-log';
  plans?: string[] | string;
};

type PlanDoc = PlanMeta & {
  path: string;
  summary: string;
  slug: string;
  body: RichTextContent;
  rawBody: string;
  links: PlanLink[];
};

type RoadmapItem = {
  id: string;
  title: string;
  summary: string;
  tier: string;
  status: string;
  cloudStatus: string;
  referenceLabel: string | null;
  referenceUrl: string | null;
  planId?: string | null;
  sourceLine?: string;
};

type RoadmapTier = {
  id: string;
  title: string;
  focus?: string;
  statusSummary?: string;
  description?: string;
  items: RoadmapItem[];
};

type RoadmapData = {
  tiers: RoadmapTier[];
  generatedAt: string;
};

type PlanLink = {
  label: string;
  url: string;
};

type RunLogEntry = {
  title: string;
  path: string;
  date: string | null;
  planIds: string[];
};

type PlanRunLog = {
  title: string;
  path: string;
  date: string | null;
};

type RichTextTextNode = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
};

type RichTextNode = {
  type?: string;
  url?: string;
  newTab?: boolean;
  children: Array<RichTextNode | RichTextTextNode>;
};

type RichTextContent = Array<RichTextNode | RichTextTextNode>;

const PLAN_STATUS_VALUES = new Set(['queued', 'active', 'shipped', 'tested', 'canceled']);
const PLAN_CLOUD_STATUS_VALUES = new Set(['pending', 'deploying', 'healthy']);
const MATTER_OPTIONS = {
  engines: {
    yaml: {
      parse: (input: string) => yaml.load(input) as Record<string, unknown>,
      stringify: (data: Record<string, unknown>) => yaml.dump(data),
    },
  },
};
const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, 'docs');
const PLAN_STATUS_OUTPUT = path.join(ROOT, 'docs/planning/plan-status-latest.md');
const PLAN_EXPORT_DIR = path.join(ROOT, 'docs/planning/plans-export');
const PLAN_LOG_INDEX_OUTPUT = path.join(ROOT, 'docs/planning/plan-log-index.md');
const RUN_LOGS_DIR = path.join(ROOT, 'docs/run-logs');
const ROADMAP_JSON_OUTPUT = path.join(ROOT, 'frontend/app/generated/roadmap.json');
const ROADMAP_SEED_OUTPUT = path.join(ROOT, 'cms/seed/data/roadmap.json');
const normalizeRepoBase = (value: string) => value.replace(/\/?$/, '/');
const resolveRepoBase = () => {
  const explicit =
    process.env.PLAN_DOCS_REPO_BASE ||
    process.env.ROADMAP_REPO_BASE ||
    process.env.REPO_DOCS_BASE;
  if (explicit && explicit.trim().length > 0) {
    return normalizeRepoBase(explicit.trim());
  }
  if (process.env.GITHUB_REPOSITORY) {
    const server = (process.env.GITHUB_SERVER_URL || 'https://github.com').replace(/\/$/, '');
    const ref = process.env.GITHUB_REF_NAME || 'main';
    return normalizeRepoBase(`${server}/${process.env.GITHUB_REPOSITORY}/blob/${ref}`);
  }
  return 'https://github.com/astralpirates/astralpirates.com/blob/main/';
};
const ROADMAP_REPO_BASE = resolveRepoBase();
const SHOULD_EXPORT_PLAN_MARKDOWN = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.PLAN_EXPORT ?? '')
    .trim()
    .toLowerCase(),
);
const SHOULD_SYNC_PLANS_FROM_CMS = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.PLAN_SYNC_FROM_CMS ?? '')
    .trim()
    .toLowerCase(),
);

const resolveCmsBaseUrl = () =>
  process.env.ASTRAL_API_BASE || process.env.NUXT_PUBLIC_ASTRAL_API_BASE || '';

async function main() {
  const files = await collectMarkdownFiles(DOCS_DIR);
  const planDocs: PlanDoc[] = [];
  let roadmapData: RoadmapData | null = null;
  let roadmapMetaBlock: RoadmapMeta | null = null;

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const parsed = matter(source, MATTER_OPTIONS);
    const meta = parsed.data?.meta as MetaBlock | undefined;
    if (!meta || !meta.type) {
      continue;
    }

    if (meta.type === 'plan') {
      planDocs.push(buildPlanDoc(meta, parsed.content, file));
    } else if (meta.type === 'roadmap') {
      roadmapMetaBlock = meta;
      roadmapData = parseRoadmap(parsed.content, meta, file);
    }
  }

  if (!roadmapData || !roadmapMetaBlock) {
    throw new Error('Unable to locate roadmap metadata. Ensure docs/planning/roadmap-priorities.md contains meta.type="roadmap".');
  }

  assertUniquePlanIds(planDocs);
  linkRoadmapPlans(roadmapData, planDocs);
  const planMap = new Map(planDocs.map((doc) => [doc.id, doc]));
  const runLogEntries = await collectRunLogEntries(planDocs);

  await writePlanStatus(planDocs);
  await writePlanLogIndex(planDocs, runLogEntries);
  if (SHOULD_SYNC_PLANS_FROM_CMS) {
    const cmsBaseUrl = resolveCmsBaseUrl();
    const cmsPlans =
      cmsBaseUrl && cmsBaseUrl.trim().length > 0
        ? await fetchPlansFromCms({
            baseUrl: cmsBaseUrl,
            onError: (error, context) => {
              // eslint-disable-next-line no-console
              console.warn(
                '[plan:status] Failed to sync plans from CMS; falling back to markdown snapshot',
                { endpoint: context.endpoint, error: error.message },
              );
            },
          })
        : null;

    if (cmsPlans && cmsPlans.plans.length > 0) {
      await writePlansSnapshotPayload({
        generatedAt: cmsPlans.generatedAt ?? new Date().toISOString(),
        plans: cmsPlans.plans,
      }, runLogEntries);
    } else {
      await writePlansSnapshot(planDocs, runLogEntries);
    }
  } else {
    await writePlansSnapshot(planDocs, runLogEntries);
  }
  if (SHOULD_EXPORT_PLAN_MARKDOWN) {
    await writePlanExports(planDocs);
  }
  await writeRoadmapJson(roadmapData, roadmapMetaBlock, planMap);
}

async function collectMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'plans-export') {
        continue;
      }
      files.push(...(await collectMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function collectRunLogFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await collectRunLogFiles(fullPath)));
      } else if (entry.isFile() && entry.name === '00-overview.md') {
        files.push(fullPath);
      }
    }
    return files;
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function collectRunLogEntries(planDocs: PlanDoc[]): Promise<RunLogEntry[]> {
  const planByPath = new Map(planDocs.map((doc) => [normalizeDocPath(doc.path), doc]));
  const planIds = new Set(planDocs.map((doc) => doc.id));
  const unknownPlanIds = new Set<string>();
  const entries: RunLogEntry[] = [];
  const files = await collectRunLogFiles(RUN_LOGS_DIR);

  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    const parsed = matter(source, MATTER_OPTIONS);
    const meta = parsed.data?.meta as Partial<RunLogMeta> | undefined;
    const planIdsFromMeta = normalizePlanReferences(meta?.plans);
    const planIdsFromLinks = extractPlanIdsFromContent(parsed.content, planByPath);
    const planIdsForLog = uniqueStrings([...planIdsFromMeta, ...planIdsFromLinks]).filter((id) => {
      if (planIds.has(id)) return true;
      if (!unknownPlanIds.has(id)) {
        unknownPlanIds.add(id);
        // eslint-disable-next-line no-console
        console.warn(`[plan:status] Run log references unknown plan id "${id}" (${file})`);
      }
      return false;
    });

    if (!planIdsForLog.length) continue;

    entries.push({
      title: extractRunLogTitle(parsed.content, file),
      path: normalizeRunLogPath(file),
      date: extractRunLogDate(file),
      planIds: planIdsForLog,
    });
  }

  return entries;
}

function normalizeEnum(value: string, allowed: Set<string>, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().toLowerCase();
  if (allowed.has(trimmed)) return trimmed;
  return fallback;
}

function transformPlanMeta(meta: PlanMeta, filePath: string): PlanMeta & { path: string; summary: string } {
  const required: (keyof PlanMeta)[] = [
    'id',
    'title',
    'owner',
    'tier',
    'status',
    'cloudStatus',
    'lastUpdated',
  ];
  for (const key of required) {
    if (!meta[key]) {
      throw new Error(`Missing plan meta field "${key}" in ${filePath}`);
    }
  }
  const summary = typeof meta.summary === 'string' ? meta.summary.trim() : '';
  const status = normalizeEnum(meta.status, PLAN_STATUS_VALUES, 'queued');
  const cloudStatus = normalizeEnum(meta.cloudStatus, PLAN_CLOUD_STATUS_VALUES, 'pending');
  return {
    ...meta,
    status,
    cloudStatus,
    summary,
    path: path.relative(ROOT, filePath).replace(/\\/g, '/'),
  };
}

function slugifyPlanId(value: string): string {
  const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const normalised = trimmed.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return normalised || 'plan';
}

function normalisePlanLink(link: unknown): PlanLink | null {
  if (!link || typeof link !== 'object') {
    if (typeof link === 'string') {
      const url = link.trim();
      return url ? { label: url, url } : null;
    }
    return null;
  }

  const label = typeof (link as PlanLink).label === 'string' ? (link as PlanLink).label.trim() : '';
  const url = typeof (link as PlanLink).url === 'string' ? (link as PlanLink).url.trim() : '';
  if (!url) return null;
  return { label: label || url, url };
}

function parsePlanLinks(meta: PlanMeta): PlanLink[] {
  const links = Array.isArray(meta.links) ? meta.links : [];
  return links.map(normalisePlanLink).filter(Boolean) as PlanLink[];
}

function markdownToRichText(markdown: string): RichTextContent {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[][] = [];
  let current: string[] = [];

  lines.forEach((line) => {
    if (line.trim().length === 0) {
      if (current.length) {
        blocks.push(current);
        current = [];
      }
      return;
    }
    current.push(line);
  });
  if (current.length) {
    blocks.push(current);
  }

  const toTextNode = (text: string): RichTextTextNode => ({ text });
  const nodes: RichTextContent = [];

  blocks.forEach((block) => {
    const first = block[0] ?? '';
    const headingMatch = first.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const type = level === 1 ? 'h2' : level === 2 ? 'h3' : 'h4';
      nodes.push({
        type,
        children: [toTextNode(text)],
      });
      return;
    }

    const bulletList = block.every((line) => /^[-*]\s+/.test(line.trim()));
    if (bulletList) {
      const items = block
        .map((line) => line.replace(/^[-*]\s+/, '').trim())
        .filter(Boolean)
        .map<RichTextNode>((text) => ({
          type: 'li',
          children: [toTextNode(text)],
        }));
      if (items.length) {
        nodes.push({ type: 'ul', children: items });
      }
      return;
    }

    const orderedList = block.every((line) => /^\d+\.\s+/.test(line.trim()));
    if (orderedList) {
      const items = block
        .map((line) => line.replace(/^\d+\.\s+/, '').trim())
        .filter(Boolean)
        .map<RichTextNode>((text) => ({
          type: 'li',
          children: [toTextNode(text)],
        }));
      if (items.length) {
        nodes.push({ type: 'ol', children: items });
      }
      return;
    }

    const paragraph = block
      .map((line) => line.trim())
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (paragraph.length) {
      nodes.push({
        type: 'paragraph',
        children: [toTextNode(paragraph)],
      });
    }
  });

  return nodes;
}

function buildPlanDoc(meta: PlanMeta, rawBody: string, filePath: string): PlanDoc {
  const base = transformPlanMeta(meta, filePath);
  const bodyContent = markdownToRichText(rawBody.trim());
  return {
    ...base,
    slug: slugifyPlanId(base.id),
    rawBody: rawBody.trim(),
    body: bodyContent,
    links: parsePlanLinks(meta),
  };
}

function parseRoadmap(content: string, meta: RoadmapMeta, filePath: string): RoadmapData {
  const lines = content.split(/\r?\n/);
  const tiers: RoadmapTier[] = [];
  let currentTier: RoadmapTier | null = null;

  const pushTier = () => {
    if (currentTier) {
      tiers.push(currentTier);
      currentTier = null;
    }
  };

  linesLoop: for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    if (/^##\s+Tier\s+\d/.test(line)) {
      pushTier();
      const title = line.replace(/^##\s+/, '').trim();
      const tierMatch = title.match(/Tier\s+(\d+)/i);
      const tierId = tierMatch ? `tier${tierMatch[1]}` : title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      currentTier = {
        id: tierId,
        title,
        description: meta.tierDescriptions?.[tierId],
        items: [],
      };
      continue;
    }

    if (currentTier && line.startsWith('**Focus:**')) {
      currentTier.focus = line.replace('**Focus:**', '').trim();
      continue;
    }

    if (currentTier && line.startsWith('**Status:**')) {
      currentTier.statusSummary = line.replace('**Status:**', '').trim();
      continue;
    }

    if (line.startsWith('###')) {
      continue linesLoop;
    }

    if (line.startsWith('- **')) {
      if (!currentTier) {
        throw new Error(`Encountered roadmap item outside a tier in ${filePath}`);
      }
      const item = buildRoadmapItem(rawLine, currentTier.id, filePath);
      currentTier.items.push(item);
    }
  }

  pushTier();

  return { tiers, generatedAt: new Date().toISOString() };
}

function buildRoadmapItem(rawLine: string, defaultTier: string, filePath: string): RoadmapItem {
  const line = rawLine.trim();
  const titleMatch = line.match(/\*\*(.+?)\*\*/);
  if (!titleMatch) {
    throw new Error(`Unable to parse roadmap item title from line: "${rawLine}" in ${filePath}`);
  }
  const title = titleMatch[1].trim();
  const summary = (() => {
    const dashIndex = rawLine.indexOf('—');
    if (dashIndex >= 0) {
      return rawLine.slice(dashIndex + 1).trim();
    }
    return '';
  })();
  const docMatch = line.match(/`(docs\/[^`]+)`/);
  const genericMatch = line.match(/`([^`]+)`/);
  const referenceLabel = docMatch ? docMatch[1] : genericMatch ? genericMatch[1] : null;
  const referenceUrl = referenceLabel ? `${ROADMAP_REPO_BASE}${referenceLabel.replace(/^\./, '')}` : null;

  return {
    id: deriveRoadmapItemId(title),
    title,
    summary,
    tier: defaultTier,
    status: 'queued',
    cloudStatus: 'pending',
    referenceLabel,
    referenceUrl,
    planId: null,
    sourceLine: rawLine,
  };
}

function deriveRoadmapItemId(title: string): string {
  const dashIndex = title.indexOf('–');
  const hyphenIndex = title.indexOf('-');
  const splitIndex = dashIndex >= 0 ? dashIndex : hyphenIndex;
  const rawId = splitIndex >= 0 ? title.slice(0, splitIndex) : title;
  return rawId.trim() || title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function linkRoadmapPlans(data: RoadmapData, planDocs: PlanDoc[]) {
  const planMap = new Map(planDocs.map((doc) => [doc.id, doc]));
  const planByPath = new Map(planDocs.map((doc) => [normalizeDocPath(doc.path), doc]));

  for (const tier of data.tiers) {
    for (const item of tier.items) {
      const plan = resolvePlanForItem(item, planMap, planByPath);
      if (!plan) {
        throw new Error(
          `Roadmap item ${item.id} is missing a plan reference. Add an inline \`docs/...md\` reference so it can be linked to a plan document.`,
        );
      }
      item.planId = plan.id;
      item.status = plan.status;
      item.cloudStatus = plan.cloudStatus;
      // Keep roadmap reference fields canonical to the resolved plan path.
      item.referenceLabel = plan.path;
      item.referenceUrl = `${ROADMAP_REPO_BASE}${plan.path.replace(/^\./, '')}`;
    }
  }
}

function resolvePlanForItem(
  item: RoadmapItem,
  planMap: Map<string, PlanDoc>,
  planByPath: Map<string, PlanDoc>,
): PlanDoc | null {
  if (item.planId && planMap.has(item.planId)) {
    return planMap.get(item.planId) ?? null;
  }

  const matches = item.sourceLine?.match(/`([^`]+)`/g) ?? [];
  for (const match of matches) {
    const value = match.replace(/`/g, '');
    const normalized = normalizeDocPath(value);
    if (planByPath.has(normalized)) {
      return planByPath.get(normalized) ?? null;
    }
  }

  return null;
}

function normalizeDocPath(value: string): string {
  return value.replace(/^\.\//, '').replace(/\\/g, '/');
}

function normalizeRunLogPath(value: string): string {
  return normalizeDocPath(path.relative(ROOT, value));
}

function normalizePlanReferences(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function extractPlanIdsFromContent(content: string, planByPath: Map<string, PlanDoc>): string[] {
  const matches = content.match(/docs\/planning\/[A-Za-z0-9._\-\/]+\.md/g) ?? [];
  const planIds: string[] = [];
  for (const match of matches) {
    const plan = planByPath.get(normalizeDocPath(match));
    if (plan) {
      planIds.push(plan.id);
    }
  }
  return planIds;
}

function extractRunLogTitle(content: string, filePath: string): string {
  const lines = content.split(/\r?\n/);
  const heading = lines.find((line) => line.startsWith('# '));
  if (heading) {
    return heading.replace(/^#\s+/, '').trim();
  }
  return path.basename(path.dirname(filePath));
}

function extractRunLogDate(filePath: string): string | null {
  const normalized = normalizeRunLogPath(filePath);
  const parts = normalized.split('/');
  const runLogIndex = parts.indexOf('run-logs');
  if (runLogIndex === -1 || runLogIndex + 1 >= parts.length) {
    return null;
  }
  const slug = parts[runLogIndex + 1];
  const date = slug.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

async function writePlanStatus(planDocs: PlanDoc[]) {
  const now = new Date();
  const dateLabel = now.toISOString().slice(0, 10);
  const groups = new Map<string, PlanDoc[]>();
  for (const doc of planDocs) {
    const key = doc.tier || 'meta';
    const bucket = groups.get(key) ?? [];
    bucket.push(doc);
    groups.set(key, bucket);
  }

  const tierOrder = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'platform', 'support', 'meta'];
  const lines: string[] = [];
  lines.push(`# Plan Status — ${dateLabel}`);
  lines.push('');
  lines.push(`_Generated via \`pnpm plan:status\` on ${now.toISOString()}._`);
  lines.push('');

  for (const tierId of tierOrder) {
    const items = groups.get(tierId);
    if (!items || items.length === 0) continue;
    lines.push(`## ${formatTierHeading(tierId)}`);
    lines.push('');
    const sorted = [...items].sort((a, b) => titleCollator.compare(a.title, b.title));
    for (const doc of sorted) {
      lines.push(
        `- **${doc.title}** — status: \`${doc.status}\`, cloud: \`${doc.cloudStatus}\`, owner: ${doc.owner}. ([doc](${doc.path}))`
      );
      if (doc.summary) {
        lines.push(`  - ${doc.summary}`);
      }
    }
    lines.push('');
  }

  await fs.mkdir(path.dirname(PLAN_STATUS_OUTPUT), { recursive: true });
  await fs.writeFile(PLAN_STATUS_OUTPUT, lines.join('\n'), 'utf8');
}

async function writePlanLogIndex(planDocs: PlanDoc[], runLogEntries: RunLogEntry[]) {
  const now = new Date();
  const dateLabel = now.toISOString().slice(0, 10);
  const planMap = new Map(planDocs.map((doc) => [doc.id, doc]));
  const logMap = new Map<string, RunLogEntry[]>();

  for (const entry of runLogEntries) {
    for (const planId of entry.planIds) {
      if (!planMap.has(planId)) continue;
      const bucket = logMap.get(planId) ?? [];
      bucket.push(entry);
      logMap.set(planId, bucket);
    }
  }

  const lines: string[] = [];
  lines.push(`# Plan Run Logs — ${dateLabel}`);
  lines.push('');
  lines.push(`_Generated via \`pnpm plan:status\` on ${now.toISOString()}._`);
  lines.push('');
  lines.push('Add `meta.plans` frontmatter to run logs to link them to plan IDs.');
  lines.push('Planning doc links (`docs/planning/*.md`) are also detected when present.');
  lines.push('Run-log file/script paths are historical snapshots and may not exist at current HEAD.');
  lines.push('');

  if (logMap.size === 0) {
    lines.push('_No run logs linked to plans yet._');
    lines.push('');
  } else {
    const sortedPlans = [...planDocs]
      .filter((doc) => logMap.has(doc.id))
      .sort((a, b) => titleCollator.compare(a.title, b.title));

    for (const plan of sortedPlans) {
      const entries = sortRunLogEntries(logMap.get(plan.id) ?? []);
      lines.push(`## ${plan.title}`);
      lines.push('');
      lines.push(`Plan: \`${plan.id}\` ([doc](${plan.path}))`);
      lines.push('');
      for (const entry of entries) {
        const dateLabel = entry.date ?? 'Unknown date';
        lines.push(`- ${dateLabel} — ${entry.title} ([run log](${entry.path}))`);
      }
      lines.push('');
    }
  }

  await fs.mkdir(path.dirname(PLAN_LOG_INDEX_OUTPUT), { recursive: true });
  await fs.writeFile(PLAN_LOG_INDEX_OUTPUT, lines.join('\n'), 'utf8');
}

function buildPlanRunLogBlock(
  planId: string | null | undefined,
  runLogEntries: RunLogEntry[],
): { runLogs?: PlanRunLog[] } {
  if (!planId) return {};
  const matches = runLogEntries.filter((entry) => entry.planIds.includes(planId));
  if (!matches.length) return {};
  const runLogs = sortRunLogEntries(matches).map((entry) => ({
    title: entry.title,
    path: entry.path,
    date: entry.date,
  }));
  return runLogs.length ? { runLogs } : {};
}

function sortRunLogEntries(entries: RunLogEntry[]): RunLogEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) {
      return a.date > b.date ? -1 : 1;
    }
    if (a.date !== b.date) {
      return a.date ? -1 : 1;
    }
    return titleCollator.compare(a.title, b.title);
  });
}

const buildPlanSummaryBlock = (value: string): string => {
  if (!value.trim()) return '    (no summary provided)';
  const normalised = value.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  return `    ${normalised}`;
};

const buildPlanLinksBlock = (links: PlanLink[]): string[] => {
  if (!links.length) return [];
  const lines: string[] = ['  links:'];
  links.forEach((link) => {
    lines.push('    - label: ' + link.label);
    lines.push('      url: ' + link.url);
  });
  return lines;
};

async function writeJsonOutputs(payload: unknown, outputs: string[]) {
  const json = JSON.stringify(payload, null, 2);
  await Promise.all(
    outputs.map(async (outputPath) => {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, json, 'utf8');
    }),
  );
}

async function writePlansSnapshot(planDocs: PlanDoc[], runLogEntries: RunLogEntry[]) {
  const payload = createPlansSnapshotPayload(
    planDocs.map((plan) => ({
      id: plan.id,
      slug: plan.slug,
      title: plan.title,
      owner: plan.owner,
      tier: plan.tier,
      status: plan.status,
      cloudStatus: plan.cloudStatus,
      summary: plan.summary,
      lastUpdated: plan.lastUpdated,
      path: plan.path,
      links: plan.links,
      body: plan.body,
      ...buildPlanRunLogBlock(plan.id, runLogEntries),
    })),
  );

  await writePlansSnapshotFiles(payload);
}

async function writePlansSnapshotPayload(
  payload: { generatedAt: string; plans: any[] },
  runLogEntries: RunLogEntry[],
) {
  const enriched = createPlansSnapshotPayload(
    payload.plans.map((plan) => ({
      ...plan,
      ...buildPlanRunLogBlock(plan.id, runLogEntries),
    })),
    payload.generatedAt,
  );
  await writePlansSnapshotFiles(enriched);
}

async function writePlanExports(planDocs: PlanDoc[]) {
  await fs.mkdir(PLAN_EXPORT_DIR, { recursive: true });

  for (const plan of planDocs) {
    const lines: string[] = [];
    lines.push('---');
    lines.push('meta:');
    lines.push('  type: plan');
    lines.push(`  id: ${plan.id}`);
    lines.push(`  title: ${plan.title}`);
    lines.push(`  owner: ${plan.owner}`);
    lines.push(`  tier: ${plan.tier}`);
    lines.push(`  status: ${plan.status}`);
    lines.push(`  cloudStatus: ${plan.cloudStatus}`);
    lines.push(`  lastUpdated: '${plan.lastUpdated}'`);
    lines.push('  summary: >');
    lines.push(buildPlanSummaryBlock(plan.summary));
    lines.push(...buildPlanLinksBlock(plan.links));
    lines.push('---');
    lines.push('');
    if (plan.rawBody.trim()) {
      lines.push(plan.rawBody.trim());
      lines.push('');
    }

    const exportPath = path.join(PLAN_EXPORT_DIR, `${plan.slug}.md`);
    await fs.writeFile(exportPath, lines.join('\n'), 'utf8');
  }
}

const toRoadmapPlan = (plan: PlanDoc | null | undefined) =>
  plan
    ? {
        id: plan.id,
        title: plan.title,
        owner: plan.owner,
        path: plan.path,
        status: plan.status,
        cloudStatus: plan.cloudStatus,
        lastUpdated: plan.lastUpdated,
        statusChangedAt: null,
        createdAt: null,
        updatedAt: parsePlanLastUpdatedTimestamp(plan.lastUpdated),
      }
    : null;

function parsePlanLastUpdatedTimestamp(value: string): string | null {
  const trimmed = value.trim();
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const month = Number(dateOnlyMatch[2]);
    const day = Number(dateOnlyMatch[3]);
    if ([year, month, day].some((part) => Number.isNaN(part))) {
      return null;
    }
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0)).toISOString();
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function formatTierHeading(tierId: string): string {
  const map: Record<string, string> = {
    tier1: 'Tier 1 – Immediate fixes & hardening',
    tier2: 'Tier 2 – Platform & workflow',
    tier3: 'Tier 3 – Net-new investments',
    tier4: 'Tier 4 – Personalization & customization',
    tier5: 'Tier 5 – End goal',
    platform: 'Platform & Infrastructure',
    support: 'Support / Reference',
    meta: 'Meta',
  };
  return map[tierId] || tierId;
}

async function writeRoadmapJson(
  data: RoadmapData,
  roadmapMeta: RoadmapMeta,
  planMap: Map<string, PlanDoc>,
) {
  const enriched = data.tiers
    .filter((tier) => tier.items.length > 0)
    .map((tier) => ({
      ...tier,
      description: tier.description ?? roadmapMeta.tierDescriptions?.[tier.id] ?? null,
      items: tier.items
        .filter((item) => {
          const status = (item.status ?? '').toLowerCase();
          return status !== 'tested' && status !== 'canceled';
        })
        .map((item) => {
          const { sourceLine, ...rest } = item;
          return {
            ...rest,
            plan: item.planId ? toRoadmapPlan(planMap.get(item.planId)) : null,
          };
        }),
    }));

  const payload = {
    generatedAt: data.generatedAt,
    tiers: enriched,
  };

  await writeJsonOutputs(payload, [ROADMAP_JSON_OUTPUT, ROADMAP_SEED_OUTPUT]);
}

function assertUniquePlanIds(planDocs: PlanDoc[]) {
  const seen = new Set<string>();
  for (const doc of planDocs) {
    if (seen.has(doc.id)) {
      throw new Error(`Duplicate plan id detected: ${doc.id}`);
    }
    seen.add(doc.id);
  }
}

void main().catch((error) => {
  console.error('[build-plan-status] Failed to generate plan status artifacts');
  console.error(error);
  process.exitCode = 1;
});
