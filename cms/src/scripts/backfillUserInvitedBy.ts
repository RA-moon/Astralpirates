import fs from 'node:fs/promises';
import path from 'node:path';
import payload from 'payload';
import { CAPTAIN_ROLE } from '@astralpirates/shared/crewRoles';

import payloadConfig from '../../payload.config.ts';
import { isDirectExecution } from './_lib/directExecution';
import { closePayloadLifecycle } from './_lib/payloadRuntime';
import { resolveCaptainInviterId, resolveUserId } from '../utils/invitedBy';

const PAGE_LIMIT = 100;

type CliOptions = {
  apply: boolean;
  reportPath: string | null;
  captainId: number | null;
};

type CandidateAction = 'skip' | 'would-update' | 'update';

type BackfillCandidate = {
  id: number | string | null;
  email: string | null;
  role: string | null;
  currentInvitedBy: number | null;
  nextInvitedBy: number | null;
  action: CandidateAction;
  note?: string;
};

export type BackfillUserInvitedBySummary = {
  mode: 'dry-run' | 'apply';
  captainInviterId: number;
  scannedRows: number;
  matchedRows: number;
  updatedRows: number;
  wouldUpdateRows: number;
  skippedRows: number;
  ambiguousRows: number;
};

export type BackfillUserInvitedByReport = {
  generatedAt: string;
  summary: BackfillUserInvitedBySummary;
  options: {
    reportPath: string | null;
    captainId: number | null;
  };
  candidates: BackfillCandidate[];
};

const usage = (): void => {
  console.log(`Usage: pnpm --dir cms exec tsx ./src/scripts/backfillUserInvitedBy.ts [options]

Backfill users.invitedBy for non-captain accounts that are missing inviter provenance.

Options:
  --apply               Persist updates (dry-run by default)
  --captain-id <id>     Use this captain user id as inviter for all backfilled rows
  --report <path>       Write JSON report to file
  -h, --help            Show help
`);
};

const parseCaptainId = (value: string): number => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`[users-invited-by-backfill] invalid --captain-id: ${value}`);
  }
  return parsed;
};

export const parseInvitedByBackfillArgs = (argv: string[]): CliOptions => {
  let apply = false;
  let reportPath: string | null = null;
  let captainId: number | null = null;

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
        throw new Error('[users-invited-by-backfill] --report requires a path.');
      }
      reportPath = path.resolve(value);
      index += 1;
      continue;
    }

    if (arg === '--captain-id') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('[users-invited-by-backfill] --captain-id requires a value.');
      }
      captainId = parseCaptainId(value);
      index += 1;
      continue;
    }

    throw new Error(`[users-invited-by-backfill] Unknown argument: ${arg}`);
  }

  return {
    apply,
    reportPath,
    captainId,
  };
};

const normalizeRole = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;

const isCaptain = (role: unknown): boolean => normalizeRole(role) === CAPTAIN_ROLE;

export const needsInvitedByBackfill = (role: unknown, invitedBy: unknown): boolean => {
  if (isCaptain(role)) return false;
  return resolveUserId(invitedBy) == null;
};

const writeReport = async (reportPath: string, report: BackfillUserInvitedByReport): Promise<void> => {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const resolveCaptainForBackfill = async (captainIdOption: number | null): Promise<number> => {
  if (captainIdOption != null) {
    const captainDoc = await payload.findByID({
      collection: 'users',
      id: captainIdOption,
      depth: 0,
      overrideAccess: true,
    });
    if (!isCaptain((captainDoc as Record<string, unknown>)?.role)) {
      throw new Error(`[users-invited-by-backfill] user ${captainIdOption} is not a captain.`);
    }
    return captainIdOption;
  }

  const resolved = await resolveCaptainInviterId(payload);
  if (resolved == null) {
    throw new Error('[users-invited-by-backfill] no captain account found; cannot backfill invitedBy.');
  }
  return resolved;
};

export const runUserInvitedByBackfill = async (
  options: CliOptions,
): Promise<BackfillUserInvitedByReport> => {
  await payload.init({ config: payloadConfig });

  try {
    const captainInviterId = await resolveCaptainForBackfill(options.captainId);

    const candidates: BackfillCandidate[] = [];
    let scannedRows = 0;
    let matchedRows = 0;
    let updatedRows = 0;
    let wouldUpdateRows = 0;
    let skippedRows = 0;
    let ambiguousRows = 0;

    let page = 1;
    while (true) {
      const result = await payload.find({
        collection: 'users',
        limit: PAGE_LIMIT,
        page,
        depth: 0,
        overrideAccess: true,
        select: {
          id: true,
          email: true,
          role: true,
          invitedBy: true,
        },
      });

      for (const user of result.docs as Array<Record<string, unknown>>) {
        scannedRows += 1;

        const id = resolveUserId(user.id);
        const role = normalizeRole(user.role);
        const email = typeof user.email === 'string' ? user.email : null;
        const currentInvitedBy = resolveUserId(user.invitedBy);

        if (!needsInvitedByBackfill(role, currentInvitedBy)) {
          skippedRows += 1;
          candidates.push({
            id,
            email,
            role,
            currentInvitedBy,
            nextInvitedBy: currentInvitedBy,
            action: 'skip',
          });
          continue;
        }

        matchedRows += 1;

        if (id == null) {
          ambiguousRows += 1;
          candidates.push({
            id: null,
            email,
            role,
            currentInvitedBy,
            nextInvitedBy: captainInviterId,
            action: 'skip',
            note: 'missing-user-id',
          });
          continue;
        }

        if (options.apply) {
          await payload.update({
            collection: 'users',
            id,
            data: {
              invitedBy: captainInviterId,
            },
            overrideAccess: true,
            draft: false,
          });
          updatedRows += 1;
          candidates.push({
            id,
            email,
            role,
            currentInvitedBy,
            nextInvitedBy: captainInviterId,
            action: 'update',
          });
        } else {
          wouldUpdateRows += 1;
          candidates.push({
            id,
            email,
            role,
            currentInvitedBy,
            nextInvitedBy: captainInviterId,
            action: 'would-update',
          });
        }
      }

      if (page >= result.totalPages) {
        break;
      }
      page += 1;
    }

    const report: BackfillUserInvitedByReport = {
      generatedAt: new Date().toISOString(),
      summary: {
        mode: options.apply ? 'apply' : 'dry-run',
        captainInviterId,
        scannedRows,
        matchedRows,
        updatedRows,
        wouldUpdateRows,
        skippedRows,
        ambiguousRows,
      },
      options: {
        reportPath: options.reportPath,
        captainId: options.captainId,
      },
      candidates,
    };

    if (options.reportPath) {
      await writeReport(options.reportPath, report);
    }

    return report;
  } finally {
    await closePayloadLifecycle(payload);
  }
};

const main = async (): Promise<void> => {
  const options = parseInvitedByBackfillArgs(process.argv.slice(2));
  const report = await runUserInvitedByBackfill(options);
  const { summary } = report;
  console.log(
    `[users-invited-by-backfill] mode=${summary.mode} captainInviterId=${summary.captainInviterId} scanned=${summary.scannedRows} matched=${summary.matchedRows} updated=${summary.updatedRows} wouldUpdate=${summary.wouldUpdateRows} ambiguous=${summary.ambiguousRows}`,
  );
  if (options.reportPath) {
    console.log(`[users-invited-by-backfill] report=${options.reportPath}`);
  }
};

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
