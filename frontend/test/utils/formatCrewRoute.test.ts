import { describe, expect, it } from 'vitest';

import { formatCrewRoute } from '~/utils/formatCrewRoute';

describe('formatCrewRoute', () => {
  it('returns null when route is nullish or empty', () => {
    expect(formatCrewRoute(null)).toBeNull();
    expect(formatCrewRoute(undefined)).toBeNull();
    expect(formatCrewRoute('   ')).toBeNull();
  });

  it('returns bridge for the root path', () => {
    expect(formatCrewRoute('/')).toBe('bridge');
    expect(formatCrewRoute('////')).toBe('bridge');
  });

  it('extracts the final path segment', () => {
    expect(formatCrewRoute('/gangway/crew-quarters')).toBe('crew-quarters');
    expect(formatCrewRoute('gangway/crew-quarters')).toBe('crew-quarters');
    expect(formatCrewRoute('/flight-plans/alpha')).toBe('alpha');
  });

  it('strips query strings and hashes', () => {
    expect(formatCrewRoute('/gangway/crew-quarters?foo=bar')).toBe('crew-quarters');
    expect(formatCrewRoute('/gangway/crew-quarters#top')).toBe('crew-quarters');
    expect(formatCrewRoute('/gangway/crew-quarters/?foo=bar#top')).toBe('crew-quarters');
  });

  it('decodes encoded path segments', () => {
    expect(formatCrewRoute('/flight-plans/Alpha%20Centauri')).toBe('Alpha Centauri');
  });

  it('falls back to bridge when no segment remains after cleaning', () => {
    expect(formatCrewRoute('/?foo=bar')).toBe('bridge');
    expect(formatCrewRoute('/#anchor')).toBe('bridge');
  });
});
