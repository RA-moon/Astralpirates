import type { Where } from 'payload';

type PayloadWhere = Where;

const buildNonTestUserClause = (): PayloadWhere => ({
  and: [
    {
      or: [
        { isTestUser: { not_equals: true } },
        { isTestUser: { exists: false } },
      ],
    },
    {
      or: [
        { accountType: { not_equals: 'test' } },
        { accountType: { exists: false } },
      ],
    },
  ],
});

const mergeWhereClauses = (...clauses: Array<PayloadWhere | null | undefined>): PayloadWhere | undefined => {
  const resolved = clauses.filter((clause): clause is PayloadWhere => Boolean(clause));
  if (resolved.length === 0) return undefined;
  if (resolved.length === 1) return resolved[0];
  return { and: resolved };
};

export const buildNonTestUserWhere = (extraWhere?: PayloadWhere | null): PayloadWhere =>
  mergeWhereClauses(buildNonTestUserClause(), extraWhere) ?? buildNonTestUserClause();

export const buildAudienceUserWhere = (extraWhere?: PayloadWhere | null): PayloadWhere =>
  buildNonTestUserWhere(extraWhere);
