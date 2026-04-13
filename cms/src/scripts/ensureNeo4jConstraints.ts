import neo4j from 'neo4j-driver';

const constraints = [
  {
    name: 'user_payloadid_unique',
    cypher: `
      CREATE CONSTRAINT user_payloadid_unique
      IF NOT EXISTS
      FOR (u:User)
      REQUIRE u.payloadId IS UNIQUE
    `,
  },
  {
    name: 'crewmates_per_plan_unique',
    cypher: `
      CREATE CONSTRAINT crewmates_per_plan_unique
      IF NOT EXISTS
      FOR ()-[r:CREWMATES]-()
      REQUIRE (r.flightPlanId, r.memberA, r.memberB) IS UNIQUE
    `,
  },
  {
    name: 'companion_per_plan_unique',
    cypher: `
      CREATE CONSTRAINT companion_per_plan_unique
      IF NOT EXISTS
      FOR ()-[r:COMPANION]-()
      REQUIRE (r.flightPlanId, r.memberA, r.memberB) IS UNIQUE
    `,
  },
  {
    name: 'carriaged_per_plan_unique',
    cypher: `
      CREATE CONSTRAINT carriaged_per_plan_unique
      IF NOT EXISTS
      FOR ()-[r:CARRIAGED]->()
      REQUIRE (r.flightPlanId, r.crewId, r.passengerId) IS UNIQUE
    `,
  },
  {
    name: 'crewmates_rollup_unique',
    cypher: `
      CREATE CONSTRAINT crewmates_rollup_unique
      IF NOT EXISTS
      FOR ()-[r:CREWMATES_ROLLUP]-()
      REQUIRE (r.memberA, r.memberB) IS UNIQUE
    `,
  },
  {
    name: 'companion_rollup_unique',
    cypher: `
      CREATE CONSTRAINT companion_rollup_unique
      IF NOT EXISTS
      FOR ()-[r:COMPANION_ROLLUP]-()
      REQUIRE (r.memberA, r.memberB) IS UNIQUE
    `,
  },
  {
    name: 'carriaged_rollup_unique',
    cypher: `
      CREATE CONSTRAINT carriaged_rollup_unique
      IF NOT EXISTS
      FOR ()-[r:CARRIAGED_ROLLUP]->()
      REQUIRE (r.crewId, r.passengerId) IS UNIQUE
    `,
  },
];

const main = async () => {
  const uri = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER ?? 'neo4j';
  const password = process.env.NEO4J_PASSWORD ?? 'changeme';

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  const session = driver.session();

  try {
    for (const constraint of constraints) {
      try {
        await session.run(constraint.cypher);
        // eslint-disable-next-line no-console
        console.info(`[neo4j-constraints] ensured ${constraint.name}`);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[neo4j-constraints] failed to create ${constraint.name}`, error);
      }
    }
  } finally {
    await session.close();
    await driver.close();
  }
};

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[neo4j-constraints] fatal error', error);
  process.exitCode = 1;
});
