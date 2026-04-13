import { describe, expect, it } from 'vitest';

import { resolveLogHref, formatLogCode } from '@astralpirates/shared/logs';
import type { LogSummary } from '~/modules/api/schemas';

const baseLog = (overrides: Partial<LogSummary> = {}): LogSummary => ({
  id: 1,
  title: 'Test Log',
  slug: 'test-log',
  path: '/bridge/logbook/test-log',
  href: '/bridge/logbook/test-log',
  body: null,
  dateCode: null,
  logDate: null,
  headline: 'Test title',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  tagline: null,
  summary: null,
  excerpt: null,
  displayLabel: null,
  owner: null,
  flightPlanId: null,
  ...overrides,
});

describe('resolveLogHref', () => {
  it('prefers path when available', () => {
    const log = baseLog({ path: '/bridge/logbook/custom-path', slug: 'ignored' });
    expect(resolveLogHref(log)).toBe('/bridge/logbook/custom-path');
  });

  it('falls back to href when path missing', () => {
    const log = baseLog({ path: '', href: '/bridge/logbook/from-href', slug: 'ignored' });
    expect(resolveLogHref(log)).toBe('/bridge/logbook/from-href');
  });

  it('constructs from slug when path and href are invalid', () => {
    const log = baseLog({ path: '', href: '', slug: 'constructed-slug' });
    expect(resolveLogHref(log)).toBe('/bridge/logbook/constructed-slug');
  });

  it('handles absolute slug values gracefully', () => {
    const log = baseLog({ path: '', href: '', slug: '/bridge/logbook/already-prefixed' });
    expect(resolveLogHref(log)).toBe('/bridge/logbook/already-prefixed');
  });

  it('falls back to base path when slug is missing', () => {
    const log = baseLog({ path: '', href: '', slug: '' });
    expect(resolveLogHref(log)).toBe('/bridge/logbook');
  });
});

describe('formatLogCode', () => {
  it('uses dateCode when provided', () => {
    const log = baseLog({ dateCode: '20250101010101' });
    expect(formatLogCode(log)).toBe('20250101010101');
  });

  it('generates code from createdAt when dateCode missing', () => {
    const log = baseLog({ dateCode: null, createdAt: '2024-12-31T23:59:59.000Z' });
    expect(formatLogCode(log)).toBe('20241231235959');
  });

  it('falls back to zeros when createdAt is invalid', () => {
    const log = baseLog({ dateCode: null, createdAt: 'invalid date' });
    expect(formatLogCode(log)).toBe('00000000000000');
  });
});
