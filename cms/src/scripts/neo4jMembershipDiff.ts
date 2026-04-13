import payload from 'payload';
import payloadConfig from '@/payload.config.ts';

const main = async () => {
  const payloadInstance = await payload.init({ config: payloadConfig });

  try {
    const memberships = await payloadInstance.find({
      collection: 'flight-plan-memberships',
      depth: 0,
      limit: 500,
      overrideAccess: true,
      sort: '-createdAt',
    });

    console.log(
      JSON.stringify(
        {
          totalMemberships: memberships.totalDocs,
          sample: memberships.docs.map((m) => ({
            id: m.id,
            flightPlanId: (m as any).flightPlanId,
            userId: (m as any).userId,
            role: (m as any).role,
            status: (m as any).status,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await payloadInstance.db?.destroy?.().catch(() => null);
  }
};

main().catch((err) => {
  console.error('[neo4j-membership-diff] failed', err);
  process.exitCode = 1;
});
