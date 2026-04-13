import { describe, expect, it } from 'vitest';

import { listHonorBadgeDefinitions } from '@astralpirates/shared/honorBadges';
import {
  buildHonorBadgeMediaAuditReport,
  resolveHonorBadgeMediaAuditBlockers,
} from '@/src/scripts/auditHonorBadgeMediaMigration.ts';

describe('honor badge media migration audit', () => {
  const definitions = listHonorBadgeDefinitions();

  it('marks every definition fallback-only when upload media is absent', () => {
    const report = buildHonorBadgeMediaAuditReport({
      definitions,
      mediaDocs: [],
      generatedAt: '2026-04-06T00:00:00.000Z',
    });

    expect(report.summary.totalDefinitions).toBe(definitions.length);
    expect(report.summary.withUploadMedia).toBe(0);
    expect(report.summary.fallbackOnly).toBe(definitions.length);
    expect(report.summary.coveragePercent).toBe(0);
    expect(report.summary.unresolvedBadgeCodes).toEqual(definitions.map((entry) => entry.code));
    expect(resolveHonorBadgeMediaAuditBlockers(report)).toEqual([
      `${definitions.length} badge definition(s) still rely on legacy static fallback.`,
    ]);
  });

  it('reports full coverage when every definition has upload-backed media', () => {
    const report = buildHonorBadgeMediaAuditReport({
      definitions,
      mediaDocs: [
        {
          id: 11,
          badgeCode: 'pioneer',
          filename: 'badge-pioneer.svg',
          mimeType: 'image/svg+xml',
          url: '/api/honor-badge-media/file/badge-pioneer.svg',
          updatedAt: '2026-04-06T12:00:00.000Z',
        },
      ],
      generatedAt: '2026-04-06T00:00:00.000Z',
    });

    expect(report.summary.totalDefinitions).toBe(definitions.length);
    expect(report.summary.withUploadMedia).toBe(definitions.length);
    expect(report.summary.fallbackOnly).toBe(0);
    expect(report.summary.coveragePercent).toBe(100);
    expect(report.summary.unresolvedBadgeCodes).toEqual([]);
    expect(resolveHonorBadgeMediaAuditBlockers(report)).toEqual([]);
  });

  it('flags duplicate known-code uploads and orphan media records', () => {
    const report = buildHonorBadgeMediaAuditReport({
      definitions,
      mediaDocs: [
        {
          id: 11,
          badgeCode: 'pioneer',
          filename: 'pioneer-old.svg',
          updatedAt: '2026-04-01T00:00:00.000Z',
        },
        {
          id: 12,
          badgeCode: 'pioneer',
          filename: 'pioneer-new.svg',
          updatedAt: '2026-04-06T00:00:00.000Z',
        },
        {
          id: 13,
          badgeCode: 'unknown-badge',
          filename: 'unknown.svg',
          updatedAt: '2026-04-06T00:00:00.000Z',
        },
      ],
      generatedAt: '2026-04-06T00:00:00.000Z',
    });

    expect(report.summary.fallbackOnly).toBe(0);
    expect(report.summary.orphanMediaRecords).toBe(1);
    expect(report.summary.duplicateBadgeCodes).toEqual(['pioneer']);
    expect(report.badges[0]?.uploadFilename).toBe('pioneer-new.svg');
    expect(resolveHonorBadgeMediaAuditBlockers(report)).toEqual([
      '1 upload media record(s) reference unknown badge codes.',
      'Duplicate upload media records detected for: pioneer.',
    ]);
  });
});
