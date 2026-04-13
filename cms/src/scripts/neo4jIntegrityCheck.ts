import payload from 'payload';
import neo4j from 'neo4j-driver';

import payloadConfig from '@/payload.config.ts';
import { applyStandaloneNeo4jEnvFallback } from './_lib/neo4jScriptRuntime';

const getEnv = (key: string, fallback?: string) => process.env[key] ?? fallback ?? '';

const toInt = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (value && typeof (value as { toInt?: () => number }).toInt === 'function') {
    return (value as { toInt: () => number }).toInt();
  }
  return Number.parseInt(String(value ?? 0), 10) || 0;
};

applyStandaloneNeo4jEnvFallback({ logPrefix: 'neo4j-integrity-check' });

const main = async () => {
  const neo4jUri = getEnv('NEO4J_URI', 'bolt://localhost:7687');
  const neo4jUser = getEnv('NEO4J_USER', 'neo4j');
  const neo4jPassword = getEnv('NEO4J_PASSWORD', 'changeme');

  const deltaPct = Number.parseFloat(getEnv('NEO4J_INTEGRITY_DELTA_PCT', '0.2')) || 0.2;
  const minDelta = Number.parseInt(getEnv('NEO4J_INTEGRITY_MIN_DELTA', '5'), 10) || 5;

  const driver = neo4j.driver(neo4jUri, neo4j.auth.basic(neo4jUser, neo4jPassword));
  const session = driver.session();

  const payloadInstance = await payload.init({ config: payloadConfig });

  try {
    const userCountResult = await payloadInstance.find({
      collection: 'users',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const payloadUserCount = userCountResult.totalDocs ?? 0;

    const membershipCountResult = await payloadInstance.find({
      collection: 'flight-plan-memberships',
      where: {},
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const membershipCount = membershipCountResult.totalDocs ?? 0;

    const acceptedMembershipResult = await payloadInstance.find({
      collection: 'flight-plan-memberships',
      where: { invitationStatus: { equals: 'accepted' } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const acceptedMembershipCount = acceptedMembershipResult.totalDocs ?? 0;

    const nodeCounts = await session.run('MATCH (n:User) RETURN count(n) AS userNodes');
    const relCounts = await session.run(
      'MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS c ORDER BY c DESC',
    );
    const missingPlanFacts = await session.run(
      `
        MATCH ()-[r:CREWMATES|COMPANION|CARRIAGED]->()
        WHERE r.flightPlanId IS NULL
        RETURN count(r) AS missing
      `,
    );

    const userNodes = toInt(nodeCounts.records[0].get('userNodes'));
    const relationships = relCounts.records.map((r) => ({
      type: r.get('type'),
      count: toInt(r.get('c')),
    }));
    const factTotals = relationships
      .filter((rel) => rel.type === 'CREWMATES' || rel.type === 'COMPANION' || rel.type === 'CARRIAGED')
      .reduce((sum, rel) => sum + rel.count, 0);
    const missingPlanEdges = toInt(missingPlanFacts.records[0]?.get('missing'));

    const tolerance = Math.max(minDelta, Math.round(payloadUserCount * deltaPct));
    const userNodeDelta = payloadUserCount - userNodes;

    const warnings: string[] = [];
    if (Math.abs(userNodeDelta) > tolerance) {
      warnings.push(
        `User node delta ${userNodeDelta} exceeds tolerance ${tolerance} (payload=${payloadUserCount}, neo4j=${userNodes})`,
      );
    }
    if (missingPlanEdges > 0) {
      warnings.push(`Found ${missingPlanEdges} fact edges missing flightPlanId`);
    }
    if (acceptedMembershipCount > 0 && factTotals === 0) {
      warnings.push(
        'No CREWMATES/COMPANION/CARRIAGED edges present despite accepted memberships in Payload',
      );
    }

    const status = warnings.length ? 'warn' : 'ok';
    if (warnings.length) {
      process.exitCode = 1;
    }

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          status,
          payloadUserCount,
          membershipCount,
          acceptedMembershipCount,
          neo4j: {
            userNodes,
            relationships,
            missingPlanEdges,
            factTotals,
          },
          warnings,
          tolerance,
        },
        null,
        2,
      ),
    );
  } finally {
    await session.close();
    await driver.close();
    await payloadInstance.db?.destroy?.().catch(() => null);
  }
};

main().catch((err) => {
  console.error('[neo4j-integrity-check] failed', err);
  process.exitCode = 1;
}).finally(() => {
  setImmediate(() => process.exit(process.exitCode ?? 0));
});
