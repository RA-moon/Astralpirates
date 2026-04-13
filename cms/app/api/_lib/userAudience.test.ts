import { describe, expect, it } from 'vitest';

import { buildAudienceUserWhere, buildNonTestUserWhere } from './userAudience';

describe('userAudience where helpers', () => {
  it('returns a non-test predicate when no extra filters are provided', () => {
    expect(buildNonTestUserWhere()).toEqual({
      and: [
        {
          or: [{ isTestUser: { not_equals: true } }, { isTestUser: { exists: false } }],
        },
        {
          or: [{ accountType: { not_equals: 'test' } }, { accountType: { exists: false } }],
        },
      ],
    });
  });

  it('combines the non-test predicate with extra filters', () => {
    expect(buildNonTestUserWhere({ profileSlug: { like: 'nova' } })).toEqual({
      and: [
        {
          and: [
            {
              or: [{ isTestUser: { not_equals: true } }, { isTestUser: { exists: false } }],
            },
            {
              or: [{ accountType: { not_equals: 'test' } }, { accountType: { exists: false } }],
            },
          ],
        },
        { profileSlug: { like: 'nova' } },
      ],
    });
  });

  it('keeps audience helper aligned with non-test helper', () => {
    expect(buildAudienceUserWhere({ id: { equals: 7 } })).toEqual({
      and: [
        {
          and: [
            {
              or: [{ isTestUser: { not_equals: true } }, { isTestUser: { exists: false } }],
            },
            {
              or: [{ accountType: { not_equals: 'test' } }, { accountType: { exists: false } }],
            },
          ],
        },
        { id: { equals: 7 } },
      ],
    });
  });
});
