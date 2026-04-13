import fs from 'node:fs/promises';
import path from 'node:path';
import payload from 'payload';

import type { HonorBadgeDefinition } from '@astralpirates/shared/honorBadges';
import {
  listHonorBadgeDefinitions,
  resolveHonorBadgeDefinition,
} from '@astralpirates/shared/honorBadges';
import { closePayloadLifecycle } from './_lib/payloadRuntime';
import { isDirectExecution } from './_lib/directExecution';

type Options = {
  outputJson: string;
  outputMd: string | null;
  strict: boolean;
};

type RawHonorBadgeMediaDoc = {
  id?: unknown;
  badgeCode?: unknown;
  filename?: unknown;
  mimeType?: unknown;
  url?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
};

type NormalizedHonorBadgeMediaDoc = {
  id: number | string | null;
  badgeCode: string | null;
  filename: string | null;
  mimeType: string | null;
  url: string | null;
  updatedAt: string | null;
  createdAt: string | null;
};

type CoverageRow = {
  code: string;
  label: string;
  iconPath: string;
  hasUploadMedia: boolean;
  uploadRecordCount: number;
  uploadId: number | string | null;
  uploadUrl: string | null;
  uploadFilename: string | null;
  uploadMimeType: string | null;
  uploadUpdatedAt: string | null;
};

type OrphanRow = {
  id: number | string | null;
  badgeCode: string | null;
  filename: string | null;
  mimeType: string | null;
  updatedAt: string | null;
};

export type HonorBadgeMediaAuditReport = {
  generatedAt: string;
  summary: {
    totalDefinitions: number;
    withUploadMedia: number;
    fallbackOnly: number;
    coveragePercent: number;
    orphanMediaRecords: number;
    duplicateBadgeCodes: string[];
    unresolvedBadgeCodes: string[];
  };
  badges: CoverageRow[];
  orphanMedia: OrphanRow[];
};

const DEFAULT_OUTPUT_JSON = path.resolve(
  process.cwd(),
  'tmp/honor-badge-media-audit-report.json',
);
const PAGE_LIMIT = 200;

const usage = (): void => {
  // eslint-disable-next-line no-console
  console.log(`Usage: pnpm --dir cms run badges:media:audit -- [options]

Builds a deterministic honor-badge media migration audit report.

Options:
  --output-json <path>      JSON report output path (default: ${DEFAULT_OUTPUT_JSON})
  --output-md <path>        Optional markdown summary output path
  --strict                  Exit non-zero when fallback-only or orphan media records remain
  -h, --help                Show help
`);
};

const trimToNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeId = (value: unknown): number | string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

const normalizeDoc = (doc: RawHonorBadgeMediaDoc): NormalizedHonorBadgeMediaDoc => ({
  id: normalizeId(doc.id),
  badgeCode: trimToNull(doc.badgeCode)?.toLowerCase() ?? null,
  filename: trimToNull(doc.filename),
  mimeType: trimToNull(doc.mimeType),
  url: trimToNull(doc.url),
  updatedAt: trimToNull(doc.updatedAt),
  createdAt: trimToNull(doc.createdAt),
});

const timestampScore = (value: string | null): number => {
  if (!value) return Number.NEGATIVE_INFINITY;
  const score = Date.parse(value);
  return Number.isNaN(score) ? Number.NEGATIVE_INFINITY : score;
};

const selectPreferredDoc = (
  docs: readonly NormalizedHonorBadgeMediaDoc[],
): NormalizedHonorBadgeMediaDoc | null => {
  if (!docs.length) return null;

  const sorted = [...docs].sort((left, right) => {
    const leftScore = timestampScore(left.updatedAt ?? left.createdAt);
    const rightScore = timestampScore(right.updatedAt ?? right.createdAt);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return String(left.id ?? '').localeCompare(String(right.id ?? ''));
  });

  return sorted[0] ?? null;
};

const roundPercent = (value: number): number => Number.parseFloat(value.toFixed(2));

export const buildHonorBadgeMediaAuditReport = ({
  definitions,
  mediaDocs,
  generatedAt,
}: {
  definitions: readonly HonorBadgeDefinition[];
  mediaDocs: readonly RawHonorBadgeMediaDoc[];
  generatedAt?: string;
}): HonorBadgeMediaAuditReport => {
  const normalizedDocs = mediaDocs.map(normalizeDoc);
  const docsByCode = new Map<string, NormalizedHonorBadgeMediaDoc[]>();
  const orphanMedia: OrphanRow[] = [];

  for (const doc of normalizedDocs) {
    const resolvedCode = resolveHonorBadgeDefinition(doc.badgeCode)?.code ?? null;
    if (!resolvedCode) {
      orphanMedia.push({
        id: doc.id,
        badgeCode: doc.badgeCode,
        filename: doc.filename,
        mimeType: doc.mimeType,
        updatedAt: doc.updatedAt,
      });
      continue;
    }

    const entries = docsByCode.get(resolvedCode) ?? [];
    entries.push(doc);
    docsByCode.set(resolvedCode, entries);
  }

  const duplicateBadgeCodes: string[] = [];
  const badges: CoverageRow[] = definitions.map((definition) => {
    const docs = docsByCode.get(definition.code) ?? [];
    const preferred = selectPreferredDoc(docs);
    if (docs.length > 1) {
      duplicateBadgeCodes.push(definition.code);
    }

    return {
      code: definition.code,
      label: definition.label,
      iconPath: definition.iconPath,
      hasUploadMedia: docs.length > 0,
      uploadRecordCount: docs.length,
      uploadId: preferred?.id ?? null,
      uploadUrl: preferred?.url ?? null,
      uploadFilename: preferred?.filename ?? null,
      uploadMimeType: preferred?.mimeType ?? null,
      uploadUpdatedAt: preferred?.updatedAt ?? preferred?.createdAt ?? null,
    };
  });

  const withUploadMedia = badges.filter((entry) => entry.hasUploadMedia).length;
  const fallbackOnly = badges.length - withUploadMedia;
  const unresolvedBadgeCodes = badges
    .filter((entry) => !entry.hasUploadMedia)
    .map((entry) => entry.code);
  const coveragePercent = badges.length > 0 ? roundPercent((withUploadMedia / badges.length) * 100) : 100;

  return {
    generatedAt: generatedAt ?? new Date().toISOString(),
    summary: {
      totalDefinitions: badges.length,
      withUploadMedia,
      fallbackOnly,
      coveragePercent,
      orphanMediaRecords: orphanMedia.length,
      duplicateBadgeCodes: Array.from(new Set(duplicateBadgeCodes)).sort((left, right) =>
        left.localeCompare(right),
      ),
      unresolvedBadgeCodes,
    },
    badges,
    orphanMedia,
  };
};

export const resolveHonorBadgeMediaAuditBlockers = (
  report: HonorBadgeMediaAuditReport,
): string[] => {
  const blockers: string[] = [];
  if (report.summary.fallbackOnly > 0) {
    blockers.push(
      `${report.summary.fallbackOnly} badge definition(s) still rely on legacy static fallback.`,
    );
  }
  if (report.summary.orphanMediaRecords > 0) {
    blockers.push(
      `${report.summary.orphanMediaRecords} upload media record(s) reference unknown badge codes.`,
    );
  }
  if (report.summary.duplicateBadgeCodes.length > 0) {
    blockers.push(
      `Duplicate upload media records detected for: ${report.summary.duplicateBadgeCodes.join(', ')}.`,
    );
  }
  return blockers;
};

export const buildHonorBadgeMediaAuditMarkdown = (
  report: HonorBadgeMediaAuditReport,
): string => {
  const lines: string[] = [];
  lines.push('# Honor Badge Media Migration Audit');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Coverage: ${report.summary.withUploadMedia}/${report.summary.totalDefinitions} (${report.summary.coveragePercent}%)`);
  lines.push(`Fallback-only badge definitions: ${report.summary.fallbackOnly}`);
  lines.push(`Orphan upload records: ${report.summary.orphanMediaRecords}`);
  lines.push('');
  lines.push('## Badge Coverage');
  lines.push('');
  lines.push('| Badge code | Upload media | Upload records | Upload filename | Upload mime | Fallback iconPath |');
  lines.push('| --- | --- | ---: | --- | --- | --- |');
  for (const badge of report.badges) {
    lines.push(
      `| \`${badge.code}\` | ${badge.hasUploadMedia ? 'yes' : 'no'} | ${badge.uploadRecordCount} | ${badge.uploadFilename ?? '—'} | ${badge.uploadMimeType ?? '—'} | \`${badge.iconPath}\` |`,
    );
  }

  if (report.summary.unresolvedBadgeCodes.length > 0) {
    lines.push('');
    lines.push('## Unresolved Fallback-Only Badges');
    lines.push('');
    for (const code of report.summary.unresolvedBadgeCodes) {
      lines.push(`- \`${code}\``);
    }
  }

  if (report.orphanMedia.length > 0) {
    lines.push('');
    lines.push('## Orphan Upload Records');
    lines.push('');
    lines.push('| ID | badgeCode | filename | mimeType | updatedAt |');
    lines.push('| ---: | --- | --- | --- | --- |');
    for (const orphan of report.orphanMedia) {
      lines.push(
        `| ${String(orphan.id ?? '—')} | ${orphan.badgeCode ?? '—'} | ${orphan.filename ?? '—'} | ${orphan.mimeType ?? '—'} | ${orphan.updatedAt ?? '—'} |`,
      );
    }
  }

  lines.push('');
  return lines.join('\n');
};

const parseArgs = (): Options => {
  const args = process.argv.slice(2);
  let outputJson = DEFAULT_OUTPUT_JSON;
  let outputMd: string | null = null;
  let strict = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') continue;

    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }

    if (arg === '--output-json') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('[audit-honor-badge-media] --output-json requires a value.');
      }
      outputJson = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--output-md') {
      const value = args[index + 1];
      if (!value) {
        throw new Error('[audit-honor-badge-media] --output-md requires a value.');
      }
      outputMd = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--strict') {
      strict = true;
      continue;
    }

    throw new Error(`[audit-honor-badge-media] unknown argument: ${arg}`);
  }

  return {
    outputJson,
    outputMd,
    strict,
  };
};

const writeAuditReport = async (
  report: HonorBadgeMediaAuditReport,
  options: Options,
): Promise<void> => {
  await fs.mkdir(path.dirname(options.outputJson), { recursive: true });
  await fs.writeFile(options.outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (options.outputMd) {
    const markdown = buildHonorBadgeMediaAuditMarkdown(report);
    await fs.mkdir(path.dirname(options.outputMd), { recursive: true });
    await fs.writeFile(options.outputMd, markdown, 'utf8');
  }
};

const loadHonorBadgeMediaDocs = async (): Promise<RawHonorBadgeMediaDoc[]> => {
  const docs: RawHonorBadgeMediaDoc[] = [];
  for (let page = 1; page <= 1_000; page += 1) {
    const result = await payload.find({
      collection: 'honor-badge-media',
      depth: 0,
      page,
      limit: PAGE_LIMIT,
      overrideAccess: true,
    });

    docs.push(...(result.docs as RawHonorBadgeMediaDoc[]));
    if (!result.docs.length || page >= result.totalPages) break;
  }
  return docs;
};

export const runHonorBadgeMediaAudit = async (): Promise<HonorBadgeMediaAuditReport> => {
  const options = parseArgs();
  const payloadConfigModule = await import('../../payload.config.ts');
  await payload.init({ config: payloadConfigModule.default });

  try {
    const mediaDocs = await loadHonorBadgeMediaDocs();
    const definitions = listHonorBadgeDefinitions();
    const report = buildHonorBadgeMediaAuditReport({
      definitions,
      mediaDocs,
    });
    const blockers = resolveHonorBadgeMediaAuditBlockers(report);

    await writeAuditReport(report, options);
    payload.logger.info(
      {
        outputJson: options.outputJson,
        outputMd: options.outputMd,
        coveragePercent: report.summary.coveragePercent,
        fallbackOnly: report.summary.fallbackOnly,
        orphanMediaRecords: report.summary.orphanMediaRecords,
        duplicateBadgeCodes: report.summary.duplicateBadgeCodes,
      },
      '[audit-honor-badge-media] completed',
    );

    if (options.strict && blockers.length > 0) {
      throw new Error(`[audit-honor-badge-media] strict mode failed: ${blockers.join(' ')}`);
    }

    return report;
  } finally {
    await closePayloadLifecycle(payload);
  }
};

if (isDirectExecution(import.meta.url)) {
  runHonorBadgeMediaAudit()
    .then(() => process.exit(0))
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    });
}
