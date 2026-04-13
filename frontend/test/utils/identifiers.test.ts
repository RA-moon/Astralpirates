import { describe, expect, it } from 'vitest';
import { normalizeIdentifier } from '~/utils/identifiers';

describe('normalizeIdentifier', () => {
  it('converts primitive identifiers to trimmed strings', () => {
    expect(normalizeIdentifier(42)).toBe('42');
    expect(normalizeIdentifier('  crew-7 ')).toBe('crew-7');
    expect(normalizeIdentifier(BigInt(9))).toBe('9');
  });

  it('unwraps record id fields recursively', () => {
    expect(normalizeIdentifier({ id: 5 })).toBe('5');
    expect(normalizeIdentifier({ id: { id: ' 88 ' } })).toBe('88');
  });

  it('falls back to valueOf when available', () => {
    const indirect = {
      valueOf: () => 17,
    };
    expect(normalizeIdentifier(indirect)).toBe('17');
  });

  it('returns null for unknown identifiers', () => {
    expect(normalizeIdentifier(undefined)).toBeNull();
    expect(normalizeIdentifier('')).toBeNull();
    expect(normalizeIdentifier({})).toBeNull();
  });
});
