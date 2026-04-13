import fs from 'node:fs/promises';
import path from 'node:path';
import payload from 'payload';

import payloadConfig from '../../payload.config.ts';
import { isDirectExecution } from './_lib/directExecution';
import { closePayloadLifecycle } from './_lib/payloadRuntime';

const TEST_USER_EMAIL_PATTERN = /^test-[^@]+@astralpirates\.com$/i;
const PAGE_LIMIT = 100;

type CliOptions = {
  apply: boolean;
  reportPath: string | null;
  allowlistPath: string | null;
};

type CandidateAction = 'skip' | 'would-update' | 'update';

type CandidateRecord = {
  id: number | string | null;
  email: string | null;
  matchedByPattern: boolean;
  matchedByAllowlist: boolean;
  alreadyFlagged: boolean;
  action: CandidateAction;
  note?: string;
};

export type TestUserFlagBackfillSummary = {
  mode: 'dry-run' | 'apply';
  scannedRows: number;
  matchedCandidates: number;
  updatedRows: number;
  wouldUpdateRows: number;
  skippedRows: number;
  ambiguousRows: number;
};

export type TestUserFlagBackfillReport = {
  generatedAt: string;
  summary: TestUserFlagBackfillSummary;
  options: {
    allowlistPath: string | null;
    reportPath: string | null;
  };
  ambiguousAllowlistEmails: string[];
  candidates: CandidateRecord[];
};

const usage = (): void => {
  // eslint-disable-next-line no-console
  console.log(`Usage: pnpm --dir cms exec tsx ./src/scripts/backfillTestUserFlag.ts [options]

Backfill users.isTestUser for deterministic test-account identities.

Options:
  --apply                 Persist updates (dry-run by default)
  --allowlist <path>      Optional newline-delimited email allowlist for edge cases
  --report <path>         Optional JSON report output path
  -h, --help              Show help
`);
};

const normalizeEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

const resolveUserId = (value: unknown): number | string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value && typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return resolveUserId((value as { id?: unknown }).id);
  }
  return null;
};

export const isTestUserEmailCandidate = (email: string | null): boolean =>
  typeof email === 'string' && TEST_USER_EMAIL_PATTERN.test(email);

export const parseAllowlistEmails = (raw: string): Set<string> => {
  const emails = new Set<string>();
  raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line || line.startsWith('#')) return;
      const normalized = normalizeEmail(line);
      if (normalized) {
        emails.add(normalized);
      }
    });
  return emails;
};

const loadAllowlistEmails = async (allowlistPath: string | null): Promise<Set<string>> => {
  if (!allowlistPath) return new Set<string>();
  const resolvedPath = path.resolve(allowlistPath);
  const raw = await fs.readFile(resolvedPath, 'utf8');
  return parseAllowlistEmails(raw);
};

export const parseTestUserBackfillArgs = (argv: string[]): CliOptions => {
  let apply = false;
  let reportPath: string | null = null;
  let allowlistPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') continue;

    if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    }

    if (arg === '--apply') {
      apply = true;
      continue;
    }

    if (arg === '--report') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('[test-user-flag-backfill] --report requires a value.');
      }
      reportPath = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--allowlist') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('[test-user-flag-backfill] --allowlist requires a value.');
      }
      allowlistPath = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`[test-user-flag-backfill] Unknown argument: ${arg}`);
  }

  return {
    apply,
    reportPath,
    allowlistPath,
  };
};

const writeReport = async (reportPath: string, report: TestUserFlagBackfillReport): Promise<void> => {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

export const runTestUserFlagBackfill = async (
  options: CliOptions,
): Promise<TestUserFlagBackfillReport> => {
  const allowlistEmails = await loadAllowlistEmails(options.allowlistPath);
  const seenAllowlistEmails = new Set<string>();
  const candidates: CandidateRecord[] = [];

  let scannedRows = 0;
  let matchedCandidates = 0;
  let updatedRows = 0;
  let wouldUpdateRows = 0;
  let skippedRows = 0;
  let ambiguousRows = 0;

  const payloadInstance = await payload.init({
    config: payloadConfig,
  });

  try {
    let page = 1;
    while (true) {
      const result = await payloadInstance.find({
        collection: 'users',
        limit: PAGE_LIMIT,
        page,
        depth: 0,
        overrideAccess: true,
        select: {
          id: true,
          email: true,
          isTestUser: true,
          accountType: true,
        },
      });

      for (const rawDoc of result.docs as Array<Record<string, unknown>>) {
        scannedRows += 1;

        const id = resolveUserId(rawDoc.id);
        const email = normalizeEmail(rawDoc.email);
        const matchedByPattern = isTestUserEmailCandidate(email);
        const matchedByAllowlist = email ? allowlistEmails.has(email) : false;

        if (matchedByAllowlist && email) {
          seenAllowlistEmails.add(email);
        }

        if (!matchedByPattern && !matchedByAllowlist) {
          continue;
        }

        matchedCandidates += 1;

        const accountType =
          typeof rawDoc.accountType === 'string' ? rawDoc.accountType.trim().toLowerCase() : null;
        const needsTestUserUpdate = rawDoc.isTestUser !== true;
        const needsAccountTypeUpdate = accountType !== 'test';
        const alreadyFlagged = !needsTestUserUpdate && !needsAccountTypeUpdate;
        if (alreadyFlagged) {
          skippedRows += 1;
          candidates.push({
            id,
            email,
            matchedByPattern,
            matchedByAllowlist,
            alreadyFlagged: true,
            action: 'skip',
            note: 'already-flagged',
          });
          continue;
        }

        if (id == null) {
          ambiguousRows += 1;
          candidates.push({
            id: null,
            email,
            matchedByPattern,
            matchedByAllowlist,
            alreadyFlagged: false,
            action: 'skip',
            note: 'missing-user-id',
          });
          continue;
        }

        if (options.apply) {
          const updateData: Record<string, unknown> = {};
          if (needsTestUserUpdate) {
            updateData.isTestUser = true;
          }
          if (needsAccountTypeUpdate) {
            updateData.accountType = 'test';
          }

          await payloadInstance.update({
            collection: 'users',
            id,
            data: updateData,
            overrideAccess: true,
            draft: false,
          });
          updatedRows += 1;
          candidates.push({
            id,
            email,
            matchedByPattern,
            matchedByAllowlist,
            alreadyFlagged: false,
            action: 'update',
          });
        } else {
          wouldUpdateRows += 1;
          candidates.push({
            id,
            email,
            matchedByPattern,
            matchedByAllowlist,
            alreadyFlagged: false,
            action: 'would-update',
          });
        }
      }

      const currentPage = result.page ?? page;
      const totalPages = result.totalPages ?? currentPage;
      if (currentPage >= totalPages) break;
      page += 1;
    }
  } finally {
    await closePayloadLifecycle(payloadInstance, 'shutdown-first');
  }

  const ambiguousAllowlistEmails = Array.from(allowlistEmails).filter(
    (email) => !seenAllowlistEmails.has(email),
  );
  ambiguousRows += ambiguousAllowlistEmails.length;

  const report: TestUserFlagBackfillReport = {
    generatedAt: new Date().toISOString(),
    summary: {
      mode: options.apply ? 'apply' : 'dry-run',
      scannedRows,
      matchedCandidates,
      updatedRows,
      wouldUpdateRows,
      skippedRows,
      ambiguousRows,
    },
    options: {
      allowlistPath: options.allowlistPath,
      reportPath: options.reportPath,
    },
    ambiguousAllowlistEmails,
    candidates,
  };

  if (options.reportPath) {
    await writeReport(options.reportPath, report);
  }

  return report;
};

const runFromCli = async (): Promise<void> => {
  const options = parseTestUserBackfillArgs(process.argv.slice(2));
  const report = await runTestUserFlagBackfill(options);
  const logger = payload.logger;
  logger.info?.(report.summary, '[test-user-flag-backfill] completed');
  if (report.options.reportPath) {
    logger.info?.(
      { path: report.options.reportPath },
      '[test-user-flag-backfill] report written',
    );
  }
};

if (isDirectExecution(import.meta.url)) {
  runFromCli().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('[test-user-flag-backfill] failed', error);
    process.exitCode = 1;
  });
}
