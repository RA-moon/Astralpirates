import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyStandaloneNeo4jEnvFallback } from './neo4jScriptRuntime';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe('applyStandaloneNeo4jEnvFallback', () => {
  it('applies local fallback when URI is missing or docker-default', () => {
    delete process.env.NEO4J_URI;
    process.env.NEO4J_LOCAL_URI = 'bolt://localhost:8687';
    process.env.NEO4J_LOCAL_PASSWORD = 'local-secret';
    const info = vi.fn();

    applyStandaloneNeo4jEnvFallback({
      logPrefix: 'neo4j-test',
      logger: { info },
    });

    expect(process.env.NEO4J_URI).toBe('bolt://localhost:8687');
    expect(process.env.NEO4J_PASSWORD).toBe('local-secret');
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('does not override explicitly configured non-docker URI', () => {
    process.env.NEO4J_URI = 'bolt://neo4j.internal:7687';
    process.env.NEO4J_PASSWORD = 'original';
    process.env.NEO4J_LOCAL_PASSWORD = 'local-secret';
    const info = vi.fn();

    applyStandaloneNeo4jEnvFallback({
      logPrefix: 'neo4j-test',
      logger: { info },
    });

    expect(process.env.NEO4J_URI).toBe('bolt://neo4j.internal:7687');
    expect(process.env.NEO4J_PASSWORD).toBe('original');
    expect(info).not.toHaveBeenCalled();
  });
});

