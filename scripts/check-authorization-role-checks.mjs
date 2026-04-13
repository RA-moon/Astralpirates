#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const EXCEPTIONS_PATH = path.join(ROOT, 'config/authorization-role-check-exceptions.json');

const TARGET_FILES = [
  'cms/app/api/_lib/accessPolicy.ts',
  'cms/app/api/_lib/adminModeRollout.ts',
  'cms/app/api/_lib/auth.ts',
  'cms/app/api/_lib/editorWrites.ts',
  'cms/app/api/_lib/flightPlanMembers.ts',
  'cms/app/api/flight-plans/[slug]/members/route.ts',
  'cms/app/api/flight-plans/[slug]/route.ts',
  'cms/app/api/flight-plans/route.ts',
  'cms/src/collections/Avatars.ts',
  'cms/src/collections/GalleryImages.ts',
  'cms/src/collections/HonorBadgeMedia.ts',
  'cms/src/collections/TaskAttachments.ts',
  'cms/app/api/_lib/mediaAccess.ts',
  'cms/app/api/_lib/flightPlanLifecycle.ts',
  'cms/app/api/_lib/pageEditorAccess.ts',
  'frontend/app/domains/flightPlans/lifecycle.ts',
  'frontend/app/stores/adminMode.ts',
  'frontend/app/composables/usePageEditingPermissions.ts',
  'frontend/app/pages/bridge/flight-plans/index.vue',
  'frontend/app/pages/flight-plans/[...segments].vue',
];

const RULES = [
  {
    id: 'direct-role-equality',
    regex:
      /\b(?:role|websiteRole|[A-Za-z_$][\w$]*Role)\b\s*(?:===|!==|==|!=)\s*(?:CAPTAIN_ROLE|(['"`])(?:captain|quartermaster|sailing-master|boatswain|gunner|carpenter|surgeon|master-at-arms|cook|seamen|powder-monkey|cabin-boy|swabbie)\1)/,
    description: 'Direct role equality check detected; route through shared authorization capability evaluator.',
  },
  {
    id: 'normalized-role-equality',
    regex:
      /\bnormalizeCrewRole\s*\([^)]*\)\s*(?:===|!==|==|!=)\s*(?:CAPTAIN_ROLE|(['"`])(?:captain|quartermaster|sailing-master|boatswain|gunner|carpenter|surgeon|master-at-arms|cook|seamen|powder-monkey|cabin-boy|swabbie)\1)/,
    description:
      'Derived/normalized role equality check detected; route through shared authorization capability evaluator.',
  },
  {
    id: 'direct-role-threshold',
    regex: /\bisRoleAtLeast\s*\(/,
    description: 'Direct role threshold helper detected; route through shared authorization capability evaluator.',
  },
  {
    id: 'role-helper-shortcut',
    regex: /\bisCaptain\s*\(/,
    description: 'Direct website-role helper detected; route through shared authorization capability evaluator.',
  },
];

const ISO_8601_UTC_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const parseExceptionsFile = () => {
  if (!fs.existsSync(EXCEPTIONS_PATH)) {
    throw new Error(`Missing exceptions file: ${path.relative(ROOT, EXCEPTIONS_PATH)}`);
  }

  const raw = fs.readFileSync(EXCEPTIONS_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('exceptions file must be a JSON object.');
  }
  if (!Array.isArray(parsed.exceptions)) {
    throw new Error('exceptions file must include an array field: exceptions.');
  }

  const nowMs = Date.now();
  const exceptions = parsed.exceptions.map((entry, index) => {
    const pointer = `exceptions[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`${pointer} must be an object.`);
    }
    if (!isNonEmptyString(entry.file)) {
      throw new Error(`${pointer}.file must be a non-empty string.`);
    }
    if (!isNonEmptyString(entry.ruleId)) {
      throw new Error(`${pointer}.ruleId must be a non-empty string.`);
    }
    if (!isNonEmptyString(entry.linePattern)) {
      throw new Error(`${pointer}.linePattern must be a non-empty string.`);
    }
    if (!isNonEmptyString(entry.owner)) {
      throw new Error(`${pointer}.owner must be a non-empty string.`);
    }
    if (!isNonEmptyString(entry.reason)) {
      throw new Error(`${pointer}.reason must be a non-empty string.`);
    }
    if (!isNonEmptyString(entry.expiresAt) || !ISO_8601_UTC_TIMESTAMP_RE.test(entry.expiresAt)) {
      throw new Error(`${pointer}.expiresAt must be an ISO-8601 UTC timestamp (e.g. 2026-05-01T00:00:00Z).`);
    }
    const expiresAtMs = Date.parse(entry.expiresAt);
    if (!Number.isFinite(expiresAtMs)) {
      throw new Error(`${pointer}.expiresAt is not a valid timestamp.`);
    }
    if (expiresAtMs <= nowMs) {
      throw new Error(`${pointer}.expiresAt is expired. Extend or remove this exception.`);
    }
    return {
      file: entry.file,
      ruleId: entry.ruleId,
      linePattern: entry.linePattern,
      owner: entry.owner,
      reason: entry.reason,
      expiresAt: entry.expiresAt,
    };
  });

  return exceptions;
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isViolationExcepted = ({ exceptions, file, ruleId, line }) =>
  exceptions.some(
    (exception) =>
      exception.file === file &&
      exception.ruleId === ruleId &&
      line.match(new RegExp(escapeRegex(exception.linePattern))),
  );

const auditFile = ({ file, exceptions }) => {
  const absolute = path.join(ROOT, file);
  if (!fs.existsSync(absolute)) {
    throw new Error(`Target file not found: ${file}`);
  }
  const lines = fs.readFileSync(absolute, 'utf8').split('\n');
  const violations = [];
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      if (!rule.regex.test(line)) continue;
      if (isViolationExcepted({ exceptions, file, ruleId: rule.id, line })) continue;
      violations.push({
        file,
        lineNumber: index + 1,
        ruleId: rule.id,
        description: rule.description,
        line: line.trim(),
      });
    }
  });
  return violations;
};

const run = () => {
  const exceptions = parseExceptionsFile();
  const violations = TARGET_FILES.flatMap((file) => auditFile({ file, exceptions }));

  if (violations.length === 0) {
    console.log(`[authorization-role-checks] OK (${TARGET_FILES.length} files checked, ${exceptions.length} exceptions).`);
    return;
  }

  console.error(`[authorization-role-checks] Found ${violations.length} unauthorized direct role checks.`);
  for (const violation of violations) {
    console.error(
      `- ${violation.file}:${violation.lineNumber} [${violation.ruleId}] ${violation.description}\n  ${violation.line}`,
    );
  }
  process.exitCode = 1;
};

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[authorization-role-checks] FAILED: ${message}`);
  process.exitCode = 1;
}
