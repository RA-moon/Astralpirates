import { describe, expect, it } from 'vitest';

import {
  deriveInviteTokenIdentifiers,
  formatInviteState,
  resolveRelationId,
  sanitizeInviteName,
} from './invite';

describe('invite helpers', () => {
  it('sanitizes invite names with trim and single-space normalization', () => {
    expect(sanitizeInviteName('  Ada   Lovelace  ')).toBe('Ada Lovelace');
  });

  it('rejects invalid invite names', () => {
    expect(sanitizeInviteName('A')).toBeNull();
    expect(sanitizeInviteName('1234')).toBeNull();
    expect(sanitizeInviteName(undefined)).toBeNull();
  });

  it('resolves relation ids from scalar and nested relation values', () => {
    expect(resolveRelationId(42)).toBe(42);
    expect(resolveRelationId('42')).toBe(42);
    expect(resolveRelationId({ id: '7' })).toBe(7);
    expect(resolveRelationId({ id: { id: 9 } })).toBe(9);
    expect(resolveRelationId('abc')).toBeNull();
    expect(resolveRelationId(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('formats invite state with derived resend/invite flags', () => {
    const state = formatInviteState({
      purpose: 'recruit',
      firstName: 'Nova',
      lastName: 'Skipper',
      email: 'nova@example.com',
      sentAt: '2026-04-09T00:00:00.000Z',
      invitedUser: { id: '15' },
      linkHidden: false,
    });

    expect(state).toMatchObject({
      purpose: 'recruit',
      firstName: 'Nova',
      lastName: 'Skipper',
      email: 'nova@example.com',
      invitedUser: 15,
      canInvite: false,
      canResend: true,
      linkHidden: false,
    });
  });

  it('derives invite token identifiers from mixed token payloads', () => {
    expect(deriveInviteTokenIdentifiers({ tokenId: { id: '55' }, token: 'abc' })).toEqual([55, 'abc']);
    expect(deriveInviteTokenIdentifiers({ tokenId: 'nope', token: '' })).toEqual([null, null]);
  });
});
