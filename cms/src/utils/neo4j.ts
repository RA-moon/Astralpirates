import neo4j, { Driver, QueryResult } from 'neo4j-driver';

let driver: Driver | null = null;

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const normaliseNumericValue = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (value && typeof value === 'object') {
    const maybeNeo4jInt = value as { toNumber?: () => number; low?: number; high?: number };
    if (typeof maybeNeo4jInt.toNumber === 'function') {
      try {
        const asNumber = maybeNeo4jInt.toNumber();
        if (Number.isFinite(asNumber)) return asNumber;
      } catch {
        // Fall through to other parsing strategies.
      }
    }
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const NEO4J_CONNECT_TIMEOUT_MS = parsePositiveInteger(process.env.NEO4J_CONNECT_TIMEOUT_MS, 5_000);
const NEO4J_ACQUIRE_TIMEOUT_MS = parsePositiveInteger(process.env.NEO4J_ACQUIRE_TIMEOUT_MS, 5_000);
const NEO4J_QUERY_TIMEOUT_MS = parsePositiveInteger(process.env.NEO4J_QUERY_TIMEOUT_MS, 5_000);
const NEO4J_BULK_QUERY_TIMEOUT_MS = parsePositiveInteger(process.env.NEO4J_BULK_QUERY_TIMEOUT_MS, 20_000);
const NEO4J_ROUTING = (neo4j as any)?.routing as { READ?: unknown; WRITE?: unknown } | undefined;
const NEO4J_ROUTING_READ = NEO4J_ROUTING?.READ;
const NEO4J_ROUTING_WRITE = NEO4J_ROUTING?.WRITE;

const executeQueryWithTimeout = async <T = QueryResult>(
  neo4jDriver: Driver,
  query: string,
  parameters: Record<string, unknown>,
  {
    timeoutMs = NEO4J_QUERY_TIMEOUT_MS,
    routing,
  }: {
    timeoutMs?: number;
    routing?: unknown;
  } = {},
): Promise<T> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return (await neo4jDriver.executeQuery(query, parameters, {
      ...(routing ? { routing } : {}),
      signal: controller.signal,
    } as any)) as T;
  } finally {
    clearTimeout(timer);
  }
};

export const getNeo4jDriver = (): Driver => {
  if (!driver) {
    const uri = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER ?? 'neo4j';
    const password = process.env.NEO4J_PASSWORD ?? 'changeme';

    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      connectionTimeout: NEO4J_CONNECT_TIMEOUT_MS,
      connectionAcquisitionTimeout: NEO4J_ACQUIRE_TIMEOUT_MS,
    });
  }

  return driver;
};

export const closeNeo4jDriver = async (): Promise<void> => {
  if (driver) {
    await driver.close();
    driver = null;
  }
};

export const isNeo4jSyncDisabled = () =>
  process.env.NEO4J_SYNC_DISABLED === '1' || process.env.NEO4J_SYNC_DISABLED === 'true';

export const isNeo4jSyncEnabled = () => !isNeo4jSyncDisabled();

export const requireNeo4jSyncEnabled = (context?: string): void => {
  if (!isNeo4jSyncDisabled()) return;
  const prefix = context ? `${context} ` : '';
  const message = `${prefix}Neo4j sync disabled via NEO4J_SYNC_DISABLED=1`;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${message}; refusing to continue in production.`);
  }
  console.warn(message);
};

const ensureDriver = () => {
  if (isNeo4jSyncDisabled()) {
    return null;
  }
  try {
    return getNeo4jDriver();
  } catch (error) {
    console.warn('[neo4j] failed to acquire driver', error);
    return null;
  }
};

type IdLike = string | number;

const normaliseId = (value: IdLike): string => String(value);

export const upsertInviteEdge = async ({
  inviterId,
  inviteeId,
  inviteeProps,
  inviterProps,
}: {
  inviterId: IdLike;
  inviteeId: IdLike;
  inviteeProps?: Record<string, unknown>;
  inviterProps?: Record<string, unknown>;
}): Promise<void> => {
  const neo4jDriver = ensureDriver();
  if (!neo4jDriver) return;

  try {
    const params = {
      inviterId: normaliseId(inviterId),
      inviteeId: normaliseId(inviteeId),
      inviteeProps: inviteeProps ?? {},
      inviterProps: inviterProps ?? {},
    };
    await executeQueryWithTimeout(
      neo4jDriver,
      `MERGE (invitee:User {payloadId: $inviteeId})
       SET invitee.updatedAt = datetime()
       SET invitee += $inviteeProps
       MERGE (inviter:User {payloadId: $inviterId})
       SET inviter.updatedAt = datetime()
       SET inviter += $inviterProps
       MERGE (inviter)-[:HIRED]->(invitee)`,
      params,
      { routing: NEO4J_ROUTING_WRITE },
    );
  } catch (error) {
    console.warn('[neo4j] failed to upsert invite edge', { inviterId, inviteeId, error });
  }
};

export const removeInviteEdgesForUser = async (inviteeId: IdLike): Promise<void> => {
  const neo4jDriver = ensureDriver();
  if (!neo4jDriver) return;

  try {
    await executeQueryWithTimeout(
      neo4jDriver,
      `MATCH (:User)-[edge:HIRED]->(:User {payloadId: $inviteeId})
       DELETE edge`,
      { inviteeId: normaliseId(inviteeId) },
      { routing: NEO4J_ROUTING_WRITE },
    );
  } catch (error) {
    console.warn('[neo4j] failed to remove invite edges', { inviteeId, error });
  }
};

export const fetchInviterForUser = async (
  inviteeId: IdLike,
): Promise<string | null> => {
  const neo4jDriver = ensureDriver();
  if (!neo4jDriver) return null;

  try {
    const result: QueryResult = await executeQueryWithTimeout(
      neo4jDriver,
       `MATCH (inviter:User)-[:HIRED]->(:User {payloadId: $inviteeId})
        RETURN inviter.payloadId AS inviterId
        LIMIT 1`,
       { inviteeId: normaliseId(inviteeId) },
      { routing: NEO4J_ROUTING_READ },
    );
    const record = result.records?.[0];
    if (!record) return null;
    const value = record.get('inviterId');
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
    if (value != null) {
      const asNumber = Number(value);
      if (!Number.isNaN(asNumber)) {
        return String(asNumber);
      }
    }
    return null;
  } catch (error) {
    console.warn('[neo4j] failed to fetch inviter', { inviteeId, error });
    return null;
  }
};

const edgeProcessedCache = new Set<string>();

const makeCacheKey = (relationship: string, a: string, b: string, planId?: string | null) =>
  `${relationship}:${a}:${b}:${planId ?? 'none'}`;

const shouldSkipEdge = (relationship: string, a: string, b: string, planId?: string | null) => {
  if (!planId) return false;
  const key = makeCacheKey(relationship, a, b, planId);
  if (edgeProcessedCache.has(key)) return true;
  edgeProcessedCache.add(key);
  edgeProcessedCache.add(makeCacheKey(relationship, b, a, planId));
  return false;
};

const sanitizeRelationship = (relationship: string): string =>
  relationship.replace(/[^A-Z_]/gi, '').toUpperCase();

const normaliseOccurredAt = (value?: string | null) => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
};

type UndirectedFactParams = {
  memberAId: IdLike;
  memberBId: IdLike;
  flightPlanId: IdLike;
  relationship: 'CREWMATES' | 'COMPANION';
  occurredAt?: string | null;
  roleA?: string | null;
  roleB?: string | null;
};

const normalizeRole = (value?: string | null) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed.toLowerCase() : null;
};

const upsertUndirectedFactEdge = async ({
  memberAId,
  memberBId,
  flightPlanId,
  relationship,
  occurredAt,
  roleA,
  roleB,
}: UndirectedFactParams): Promise<void> => {
  const neo4jDriver = ensureDriver();
  if (!neo4jDriver) return;

  const first = normaliseId(memberAId);
  const second = normaliseId(memberBId);
  if (first === second) return;
  const ordered = [first, second].sort();
  const orderedRoles: [string | null, string | null] =
    first <= second
      ? [normalizeRole(roleA), normalizeRole(roleB)]
      : [normalizeRole(roleB), normalizeRole(roleA)];

  const rel = sanitizeRelationship(relationship);
  if (!rel) {
    console.warn('[neo4j] skipped edge with invalid relationship', { relationship });
    return;
  }

  const normalizedOccurredAt = normaliseOccurredAt(occurredAt);
  const params = {
    memberAId: ordered[0],
    memberBId: ordered[1],
    flightPlanId: normaliseId(flightPlanId),
    occurredAt: normalizedOccurredAt,
    roleA: orderedRoles[0],
    roleB: orderedRoles[1],
  };

  if (shouldSkipEdge(rel, params.memberAId, params.memberBId, params.flightPlanId)) {
    return;
  }

  try {
    await executeQueryWithTimeout(
      neo4jDriver,
      `
      MERGE (a:User {payloadId: $memberAId})
      SET a.updatedAt = datetime()
      MERGE (b:User {payloadId: $memberBId})
      SET b.updatedAt = datetime()
      MERGE (a)-[rel:${rel} {flightPlanId: $flightPlanId}]->(b)
      SET rel.weight = 1,
          rel.memberA = $memberAId,
          rel.memberB = $memberBId,
          rel.roleA = $roleA,
          rel.roleB = $roleB,
          rel.occurredAt = coalesce(datetime($occurredAt), datetime()),
          rel.updatedAt = datetime()
      `,
      params,
      { routing: NEO4J_ROUTING_WRITE },
    );
  } catch (error) {
    console.warn('[neo4j] failed to upsert relationship', {
      memberAId: params.memberAId,
      memberBId: params.memberBId,
      relationship: rel,
      error,
    });
  }
};

type CarriagedFactParams = {
  crewId: IdLike;
  passengerId: IdLike;
  flightPlanId: IdLike;
  occurredAt?: string | null;
  crewRole?: string | null;
  passengerRole?: string | null;
};

export const incrementCrewmateEdge = async (args: {
  memberAId: IdLike;
  memberBId: IdLike;
  flightPlanId: IdLike;
  occurredAt?: string | null;
  roleA?: string | null;
  roleB?: string | null;
}) => upsertUndirectedFactEdge({ ...args, relationship: 'CREWMATES' });

export const incrementCompanionEdge = async (args: {
  memberAId: IdLike;
  memberBId: IdLike;
  flightPlanId: IdLike;
  occurredAt?: string | null;
  roleA?: string | null;
  roleB?: string | null;
}) => upsertUndirectedFactEdge({ ...args, relationship: 'COMPANION' });

export const incrementCarriagedEdge = async ({
  crewId,
  passengerId,
  flightPlanId,
  occurredAt,
  crewRole,
  passengerRole,
}: CarriagedFactParams): Promise<void> => {
  const neo4jDriver = ensureDriver();
  if (!neo4jDriver) return;

  const params = {
    crewId: normaliseId(crewId),
    passengerId: normaliseId(passengerId),
    flightPlanId: normaliseId(flightPlanId),
    occurredAt: normaliseOccurredAt(occurredAt),
    crewRole: normalizeRole(crewRole),
    passengerRole: normalizeRole(passengerRole),
  };

  try {
    await executeQueryWithTimeout(
      neo4jDriver,
      `
      MERGE (crew:User {payloadId: $crewId})
      SET crew.updatedAt = datetime()
      MERGE (passenger:User {payloadId: $passengerId})
      SET passenger.updatedAt = datetime()
      MERGE (crew)-[rel:CARRIAGED {flightPlanId: $flightPlanId}]->(passenger)
      SET rel.weight = 1,
          rel.crewId = $crewId,
          rel.passengerId = $passengerId,
          rel.crewRole = $crewRole,
          rel.passengerRole = $passengerRole,
          rel.occurredAt = coalesce(datetime($occurredAt), datetime()),
          rel.updatedAt = datetime()
      `,
      params,
      { routing: NEO4J_ROUTING_WRITE },
    );
  } catch (error) {
    console.warn('[neo4j] failed to upsert carriaged edge', {
      crewId: params.crewId,
      passengerId: params.passengerId,
      error,
    });
  }
};

export type PlanEdgeSnapshot = {
  crewmates: Array<{ memberAId: string; memberBId: string }>;
  companions: Array<{ memberAId: string; memberBId: string }>;
  carriaged: Array<{ crewId: string; passengerId: string }>;
};

export const removePlanRelationshipEdges = async (
  flightPlanId: IdLike,
): Promise<PlanEdgeSnapshot> => {
  const neo4jDriver = ensureDriver();
  if (!neo4jDriver) return { crewmates: [], companions: [], carriaged: [] };

  const planId = normaliseId(flightPlanId);
  edgeProcessedCache.clear();
  try {
    const result: QueryResult = await executeQueryWithTimeout(
      neo4jDriver,
      `
      OPTIONAL MATCH (a:User)-[cm:CREWMATES {flightPlanId: $planId}]->(b:User)
      WITH collect({memberAId: coalesce(cm.memberA, a.payloadId), memberBId: coalesce(cm.memberB, b.payloadId)}) AS crewmates
      OPTIONAL MATCH (c:User)-[co:COMPANION {flightPlanId: $planId}]->(d:User)
      WITH crewmates, collect({memberAId: coalesce(co.memberA, c.payloadId), memberBId: coalesce(co.memberB, d.payloadId)}) AS companions
      OPTIONAL MATCH (crew:User)-[ca:CARRIAGED {flightPlanId: $planId}]->(passenger:User)
      WITH crewmates, companions, collect({crewId: coalesce(ca.crewId, crew.payloadId), passengerId: coalesce(ca.passengerId, passenger.payloadId)}) AS carriaged
      RETURN crewmates, companions, carriaged
      `,
      { planId },
      { timeoutMs: NEO4J_BULK_QUERY_TIMEOUT_MS, routing: NEO4J_ROUTING_READ },
    );

    await executeQueryWithTimeout(
      neo4jDriver,
      `MATCH ()-[rel:CREWMATES|COMPANION|CARRIAGED {flightPlanId: $planId}]->() DELETE rel`,
      { planId },
      { timeoutMs: NEO4J_BULK_QUERY_TIMEOUT_MS, routing: NEO4J_ROUTING_WRITE },
    );

    const record = result.records?.[0];
    if (!record) {
      return { crewmates: [], companions: [], carriaged: [] };
    }
    return {
      crewmates: (record.get('crewmates') as PlanEdgeSnapshot['crewmates']) ?? [],
      companions: (record.get('companions') as PlanEdgeSnapshot['companions']) ?? [],
      carriaged: (record.get('carriaged') as PlanEdgeSnapshot['carriaged']) ?? [],
    };
  } catch (error) {
    console.warn('[neo4j] failed to remove plan relationship edges', { flightPlanId: planId, error });
    return { crewmates: [], companions: [], carriaged: [] };
  }
};

export const removeLegacyPlanRelationshipEdges = async (): Promise<{
  deletedRelationships: number;
  batches: number;
  truncated: boolean;
}> => {
  const neo4jDriver = ensureDriver();
  if (!neo4jDriver) return { deletedRelationships: 0, batches: 0, truncated: false };

  const cleanupBatchSize = parsePositiveInteger(process.env.NEO4J_LEGACY_CLEANUP_BATCH_SIZE, 500);
  const cleanupMaxDurationMs = parsePositiveInteger(
    process.env.NEO4J_LEGACY_CLEANUP_MAX_DURATION_MS,
    120_000,
  );
  const cleanupMaxBatches = parsePositiveInteger(process.env.NEO4J_LEGACY_CLEANUP_MAX_BATCHES, 500);

  const startedAt = Date.now();
  let deletedRelationships = 0;
  let batches = 0;
  let truncated = false;

  try {
    while (true) {
      if (Date.now() - startedAt >= cleanupMaxDurationMs || batches >= cleanupMaxBatches) {
        truncated = true;
        break;
      }

      const result: QueryResult = await executeQueryWithTimeout(
        neo4jDriver,
        `
        MATCH ()-[rel:CREWMATES|COMPANION|CARRIAGED]->()
        WHERE rel.flightPlanId IS NULL
        WITH rel LIMIT $batchSize
        DELETE rel
        RETURN count(rel) AS deletedCount
        `,
        { batchSize: cleanupBatchSize },
        { timeoutMs: NEO4J_BULK_QUERY_TIMEOUT_MS, routing: NEO4J_ROUTING_WRITE },
      );

      const deletedCount = normaliseNumericValue(result.records?.[0]?.get('deletedCount'));
      batches += 1;
      deletedRelationships += deletedCount;

      if (deletedCount <= 0 || deletedCount < cleanupBatchSize) {
        break;
      }
    }

    return { deletedRelationships, batches, truncated };
  } catch (error) {
    console.warn('[neo4j] failed to remove legacy plan relationship edges', error);
    return { deletedRelationships, batches, truncated: true };
  }
};

const dedupePairs = (pairs: Array<{ a: string; b: string }>) => {
  const seen = new Set<string>();
  return pairs.filter(({ a, b }) => {
    const ordered = [a, b].sort();
    const key = `${ordered[0]}:${ordered[1]}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const dedupeCarriagedPairs = (pairs: Array<{ crew: string; passenger: string }>) => {
  const seen = new Set<string>();
  return pairs.filter(({ crew, passenger }) => {
    const key = `${crew}:${passenger}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const refreshCrewmateRollups = async (pairs: Array<{ memberAId: IdLike; memberBId: IdLike }>) => {
  const neo4jDriver = ensureDriver();
  if (!neo4jDriver || !pairs.length) return;

  const normalized = dedupePairs(
    pairs.map(({ memberAId, memberBId }) => {
      const ordered = [normaliseId(memberAId), normaliseId(memberBId)].sort();
      return { a: ordered[0], b: ordered[1] };
    }),
  );
  if (!normalized.length) return;

  const deleteQuery = `
    UNWIND $pairs AS pair
    MATCH (a:User {payloadId: pair.a})-[r:CREWMATES]->(b:User {payloadId: pair.b})
    WHERE r.flightPlanId IS NOT NULL
    WITH pair, a, b, collect(DISTINCT r.flightPlanId) AS plans
    WITH pair, a, b, size(plans) AS occurrences
    WHERE occurrences = 0
    MATCH (a)-[roll:CREWMATES_ROLLUP]->(b)
    DELETE roll
  `;

  const upsertQuery = `
    UNWIND $pairs AS pair
    MATCH (a:User {payloadId: pair.a})-[r:CREWMATES]->(b:User {payloadId: pair.b})
    WHERE r.flightPlanId IS NOT NULL
    WITH pair, a, b, collect(DISTINCT r.flightPlanId) AS plans,
         max(coalesce(r.occurredAt, r.updatedAt)) AS lastOccurredAt,
         collect({roleA: r.roleA, roleB: r.roleB}) AS rels
    WITH pair, a, b, plans, lastOccurredAt,
         reduce(maxPlanId = null, fp IN plans | CASE WHEN maxPlanId IS NULL OR fp > maxPlanId THEN fp ELSE maxPlanId END) AS lastFlightPlanId,
         size(plans) AS occurrences,
         rels
    WHERE occurrences > 0
    UNWIND rels AS rel
    WITH pair, a, b, plans, lastOccurredAt, lastFlightPlanId, occurrences,
         coalesce(rel.roleA, 'unknown') + '-' + coalesce(rel.roleB, 'unknown') AS roleKey
    WITH pair, a, b, plans, lastOccurredAt, lastFlightPlanId, occurrences, roleKey, count(*) AS roleCount
    WITH pair, a, b, lastOccurredAt, lastFlightPlanId, occurrences, collect({key: roleKey, count: roleCount}) AS roleCounts
    WITH pair, a, b, lastOccurredAt, lastFlightPlanId, occurrences,
         [rc IN roleCounts | rc.key] AS roleKeys,
         [rc IN roleCounts | rc.count] AS roleOccurrences
    MERGE (a)-[roll:CREWMATES_ROLLUP]->(b)
    SET roll.occurrences = occurrences,
        roll.lastFlightPlanId = lastFlightPlanId,
        roll.lastOccurredAt = coalesce(lastOccurredAt, datetime()),
        roll.memberA = pair.a,
        roll.memberB = pair.b,
        roll.roleKeys = roleKeys,
        roll.roleOccurrences = roleOccurrences,
        roll.updatedAt = datetime()
  `;

  try {
    await executeQueryWithTimeout(neo4jDriver, deleteQuery, { pairs: normalized }, {
      timeoutMs: NEO4J_BULK_QUERY_TIMEOUT_MS,
      routing: NEO4J_ROUTING_WRITE,
    });
    await executeQueryWithTimeout(neo4jDriver, upsertQuery, { pairs: normalized }, {
      timeoutMs: NEO4J_BULK_QUERY_TIMEOUT_MS,
      routing: NEO4J_ROUTING_WRITE,
    });
  } catch (error) {
    console.warn('[neo4j] failed to refresh crewmate rollups', { error });
  }
};

export const refreshCompanionRollups = async (pairs: Array<{ memberAId: IdLike; memberBId: IdLike }>) => {
  const neo4jDriver = ensureDriver();
  if (!neo4jDriver || !pairs.length) return;

  const normalized = dedupePairs(
    pairs.map(({ memberAId, memberBId }) => {
      const ordered = [normaliseId(memberAId), normaliseId(memberBId)].sort();
      return { a: ordered[0], b: ordered[1] };
    }),
  );
  if (!normalized.length) return;

  const deleteQuery = `
    UNWIND $pairs AS pair
    MATCH (a:User {payloadId: pair.a})-[r:COMPANION]->(b:User {payloadId: pair.b})
    WHERE r.flightPlanId IS NOT NULL
    WITH pair, a, b, collect(DISTINCT r.flightPlanId) AS plans
    WITH pair, a, b, size(plans) AS occurrences
    WHERE occurrences = 0
    MATCH (a)-[roll:COMPANION_ROLLUP]->(b)
    DELETE roll
  `;

  const upsertQuery = `
    UNWIND $pairs AS pair
    MATCH (a:User {payloadId: pair.a})-[r:COMPANION]->(b:User {payloadId: pair.b})
    WHERE r.flightPlanId IS NOT NULL
    WITH pair, a, b, collect(DISTINCT r.flightPlanId) AS plans,
         max(coalesce(r.occurredAt, r.updatedAt)) AS lastOccurredAt,
         collect({roleA: r.roleA, roleB: r.roleB}) AS rels
    WITH pair, a, b, plans, lastOccurredAt,
         reduce(maxPlanId = null, fp IN plans | CASE WHEN maxPlanId IS NULL OR fp > maxPlanId THEN fp ELSE maxPlanId END) AS lastFlightPlanId,
         size(plans) AS occurrences,
         rels
    WHERE occurrences > 0
    UNWIND rels AS rel
    WITH pair, a, b, plans, lastOccurredAt, lastFlightPlanId, occurrences,
         coalesce(rel.roleA, 'unknown') + '-' + coalesce(rel.roleB, 'unknown') AS roleKey
    WITH pair, a, b, lastOccurredAt, lastFlightPlanId, occurrences, roleKey, count(*) AS roleCount
    WITH pair, a, b, lastOccurredAt, lastFlightPlanId, occurrences, collect({key: roleKey, count: roleCount}) AS roleCounts
    WITH pair, a, b, lastOccurredAt, lastFlightPlanId, occurrences,
         [rc IN roleCounts | rc.key] AS roleKeys,
         [rc IN roleCounts | rc.count] AS roleOccurrences
    MERGE (a)-[roll:COMPANION_ROLLUP]->(b)
    SET roll.occurrences = occurrences,
        roll.lastFlightPlanId = lastFlightPlanId,
        roll.lastOccurredAt = coalesce(lastOccurredAt, datetime()),
        roll.memberA = pair.a,
        roll.memberB = pair.b,
        roll.roleKeys = roleKeys,
        roll.roleOccurrences = roleOccurrences,
        roll.updatedAt = datetime()
  `;

  try {
    await executeQueryWithTimeout(neo4jDriver, deleteQuery, { pairs: normalized }, {
      timeoutMs: NEO4J_BULK_QUERY_TIMEOUT_MS,
      routing: NEO4J_ROUTING_WRITE,
    });
    await executeQueryWithTimeout(neo4jDriver, upsertQuery, { pairs: normalized }, {
      timeoutMs: NEO4J_BULK_QUERY_TIMEOUT_MS,
      routing: NEO4J_ROUTING_WRITE,
    });
  } catch (error) {
    console.warn('[neo4j] failed to refresh companion rollups', { error });
  }
};

export const refreshCarriagedRollups = async (pairs: Array<{ crewId: IdLike; passengerId: IdLike }>) => {
  const neo4jDriver = ensureDriver();
  if (!neo4jDriver || !pairs.length) return;

  const normalized = dedupeCarriagedPairs(
    pairs.map(({ crewId, passengerId }) => ({
      crew: normaliseId(crewId),
      passenger: normaliseId(passengerId),
    })),
  );
  if (!normalized.length) return;

  const deleteQuery = `
    UNWIND $pairs AS pair
    MATCH (crew:User {payloadId: pair.crew})-[r:CARRIAGED]->(passenger:User {payloadId: pair.passenger})
    WHERE r.flightPlanId IS NOT NULL
    WITH pair, crew, passenger, collect(DISTINCT r.flightPlanId) AS plans
    WITH pair, crew, passenger, size(plans) AS occurrences
    WHERE occurrences = 0
    MATCH (crew)-[roll:CARRIAGED_ROLLUP]->(passenger)
    DELETE roll
  `;

  const upsertQuery = `
    UNWIND $pairs AS pair
    MATCH (crew:User {payloadId: pair.crew})-[r:CARRIAGED]->(passenger:User {payloadId: pair.passenger})
    WHERE r.flightPlanId IS NOT NULL
    WITH pair, crew, passenger, collect(DISTINCT r.flightPlanId) AS plans,
         max(coalesce(r.occurredAt, r.updatedAt)) AS lastOccurredAt,
         collect({crewRole: r.crewRole, passengerRole: r.passengerRole}) AS rels
    WITH pair, crew, passenger, plans, lastOccurredAt,
         reduce(maxPlanId = null, fp IN plans | CASE WHEN maxPlanId IS NULL OR fp > maxPlanId THEN fp ELSE maxPlanId END) AS lastFlightPlanId,
         size(plans) AS occurrences,
         rels
    WHERE occurrences > 0
    UNWIND rels AS rel
    WITH pair, crew, passenger, plans, lastOccurredAt, lastFlightPlanId, occurrences,
         coalesce(rel.crewRole, 'unknown') + '->' + coalesce(rel.passengerRole, 'unknown') AS roleKey
    WITH pair, crew, passenger, lastOccurredAt, lastFlightPlanId, occurrences, roleKey, count(*) AS roleCount
    WITH pair, crew, passenger, lastOccurredAt, lastFlightPlanId, occurrences, collect({key: roleKey, count: roleCount}) AS roleCounts
    WITH pair, crew, passenger, lastOccurredAt, lastFlightPlanId, occurrences,
         [rc IN roleCounts | rc.key] AS roleKeys,
         [rc IN roleCounts | rc.count] AS roleOccurrences
    MERGE (crew)-[roll:CARRIAGED_ROLLUP]->(passenger)
    SET roll.occurrences = occurrences,
        roll.lastFlightPlanId = lastFlightPlanId,
        roll.lastOccurredAt = coalesce(lastOccurredAt, datetime()),
        roll.crewId = pair.crew,
        roll.passengerId = pair.passenger,
        roll.roleKeys = roleKeys,
        roll.roleOccurrences = roleOccurrences,
        roll.updatedAt = datetime()
  `;

  try {
    await executeQueryWithTimeout(neo4jDriver, deleteQuery, { pairs: normalized }, {
      timeoutMs: NEO4J_BULK_QUERY_TIMEOUT_MS,
      routing: NEO4J_ROUTING_WRITE,
    });
    await executeQueryWithTimeout(neo4jDriver, upsertQuery, { pairs: normalized }, {
      timeoutMs: NEO4J_BULK_QUERY_TIMEOUT_MS,
      routing: NEO4J_ROUTING_WRITE,
    });
  } catch (error) {
    console.warn('[neo4j] failed to refresh carriaged rollups', { error });
  }
};
