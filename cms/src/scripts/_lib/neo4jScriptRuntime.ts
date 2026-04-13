const DEFAULT_DOCKER_URI = 'bolt://neo4j:7687';
const DEFAULT_LOCAL_FALLBACK_URI = 'bolt://localhost:7687';

type ApplyStandaloneNeo4jEnvFallbackOptions = {
  logPrefix: string;
  logger?: Pick<typeof console, 'info'>;
};

export const applyStandaloneNeo4jEnvFallback = ({
  logPrefix,
  logger = console,
}: ApplyStandaloneNeo4jEnvFallbackOptions): void => {
  const configuredUri = process.env.NEO4J_URI;
  const shouldOverride =
    !configuredUri || configuredUri === DEFAULT_DOCKER_URI || configuredUri === 'bolt://neo4j';

  if (!shouldOverride) return;

  const localFallbackUri = process.env.NEO4J_LOCAL_URI ?? DEFAULT_LOCAL_FALLBACK_URI;
  process.env.NEO4J_URI = localFallbackUri;

  const localPassword = process.env.NEO4J_LOCAL_PASSWORD ?? process.env.NEO4J_PASSWORD;
  if (localPassword) {
    process.env.NEO4J_PASSWORD = localPassword;
  }

  logger.info?.(
    `[${logPrefix}] Using local Neo4j connection (${process.env.NEO4J_URI}) for standalone run`,
  );
};

