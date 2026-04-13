import { describe, expect, it } from 'vitest';

import { parseDateInput, parseLimit, parsePage, sanitizeString } from './requestParsing';

describe('requestParsing helpers', () => {
  it('parses limits with fallback and cap', () => {
    expect(parseLimit('10', 25, 100)).toBe(10);
    expect(parseLimit('0', 25, 100)).toBe(25);
    expect(parseLimit('999', 25, 100)).toBe(100);
    expect(parseLimit(null, 25, 100)).toBe(25);
  });

  it('parses pages with fallback', () => {
    expect(parsePage('2')).toBe(2);
    expect(parsePage('0', 1)).toBe(1);
    expect(parsePage(null, 3)).toBe(3);
  });

  it('sanitizes optional strings', () => {
    expect(sanitizeString('  nova  ')).toBe('nova');
    expect(sanitizeString('   ')).toBeNull();
    expect(sanitizeString(null)).toBeNull();
  });

  it('parses date input only for valid date strings', () => {
    expect(parseDateInput('2026-04-09T00:00:00.000Z')?.toISOString()).toBe('2026-04-09T00:00:00.000Z');
    expect(parseDateInput('not-a-date')).toBeNull();
    expect(parseDateInput(null)).toBeNull();
  });
});
