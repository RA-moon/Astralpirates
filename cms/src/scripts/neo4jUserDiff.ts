import payload from 'payload';
import payloadConfig from '@/payload.config.ts';

type UserRecord = {
  id: number;
  email?: string;
  profileSlug?: string;
};

const upsertMissingUsers = async (payloadInstance: payload.Payload) => {
  // Lazy import to avoid circulars
  const neo4jModule = await import('@/src/utils/neo4j.ts');
  const driver = (neo4jModule as any).getNeo4jDriver?.() ?? (neo4jModule as any).ensureDriver?.();
  if (!driver) {
    console.warn('[neo4j-user-diff] Neo4j driver unavailable; skipping upsert');
    return;
  }

  // Fetch users
  const users = await payloadInstance.find({
    collection: 'users',
    depth: 0,
    limit: 500,
    overrideAccess: true,
    sort: '-createdAt',
  });
  const raMoonId = 63;
  const raMoon = users.docs.find((u) => Number(u.id) === raMoonId) as UserRecord | undefined;

  // Existing Neo4j users
  const neoIds: number[] = [];
  const neoRes = await driver.executeQuery('MATCH (u:User) RETURN u.payloadId AS id');
  neoRes.records.forEach((r: any) => {
    const v = r.get('id');
    const n = typeof v === 'string' ? Number(v) : v?.toInt?.() ?? Number(v);
    if (Number.isFinite(n)) neoIds.push(n);
  });

  const toUpsert = users.docs
    .map((u) => ({
      id: typeof u.id === 'number' ? u.id : Number(u.id),
      email: (u as UserRecord)?.email,
      profileSlug: (u as UserRecord)?.profileSlug,
    }))
    .filter((u) => Number.isFinite(u.id) && !neoIds.includes(u.id));

  if (!toUpsert.length) {
    console.log('[neo4j-user-diff] No missing users to upsert');
    return;
  }

  for (const user of toUpsert) {
    await driver.executeQuery(
      `MERGE (invitee:User {payloadId: $inviteeId})
       SET invitee.updatedAt = datetime(), invitee.profileSlug = $profileSlug, invitee.email = $email
       MERGE (inviter:User {payloadId: $inviterId})
       SET inviter.updatedAt = datetime(), inviter.profileSlug = $inviterSlug
       MERGE (inviter)-[:HIRED]->(invitee)`,
      {
        inviteeId: String(user.id),
        profileSlug: user.profileSlug ?? null,
        email: user.email ?? null,
        inviterId: String(raMoonId),
        inviterSlug: raMoon?.profileSlug ?? 'ra-moon',
      },
    );
    console.log('[neo4j-user-diff] Upserted user into Neo4j with inviter', user.id);
  }
};

const main = async () => {
  const payloadInstance = await payload.init({ config: payloadConfig });

  try {
    const users = await payloadInstance.find({
      collection: 'users',
      depth: 0,
      limit: 500,
      overrideAccess: true,
      sort: '-createdAt',
    });

    // Fetch Neo4j user IDs via SQL mirror (Payload stores IDs in Postgres)
    const userIds = users.docs
      .map((u) => (typeof u.id === 'number' ? u.id : Number(u.id)))
      .filter((id) => Number.isFinite(id)) as number[];

    console.log(
      JSON.stringify(
        users.docs.map((u) => {
          const id = typeof u.id === 'number' ? u.id : Number(u.id);
          return {
            id,
            email: (u as UserRecord)?.email,
            profileSlug: (u as UserRecord)?.profileSlug,
          };
        }),
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify(
        {
          totalPayloadUsers: users.totalDocs,
          sampleIds: userIds.slice(0, 20),
        },
        null,
        2,
      ),
    );

    await upsertMissingUsers(payloadInstance);
  } finally {
    await payloadInstance.db?.destroy?.().catch(() => null);
  }
};

main().catch((err) => {
  console.error('[neo4j-user-diff] failed', err);
  process.exitCode = 1;
});
