import fs from 'node:fs';

import { Client } from 'pg';

const LOCALHOST_NAMES = new Set(['localhost', '127.0.0.1', '::1']);
const DOCKER_NETWORK_HOSTS = new Set(['db']);

export type ScriptRunProfile = 'auto' | 'local' | 'prod';
export type RuntimeContext = 'host' | 'container';

export type DatabaseTarget = {
  host: string;
  port: number;
  database: string;
  sslMode: string | null;
};

export type DatabasePreflightResult = {
  runProfile: ScriptRunProfile;
  runtime: RuntimeContext;
  target: DatabaseTarget;
  warnings: string[];
};

type RunDatabasePreflightOptions = {
  runProfile?: ScriptRunProfile;
  scriptName: string;
  timeoutMs?: number;
  skipConnectivityCheck?: boolean;
  requiredTables?: string[];
};

const toLower = (value: string) => value.trim().toLowerCase();

const isLocalHost = (host: string): boolean => LOCALHOST_NAMES.has(toLower(host));

const isDockerNetworkAlias = (host: string): boolean => DOCKER_NETWORK_HOSTS.has(toLower(host));

const detectRuntimeContext = (): RuntimeContext => {
  if (fs.existsSync('/.dockerenv')) return 'container';
  if (process.env.CONTAINER?.trim()) return 'container';
  return 'host';
};

const parseDatabaseTarget = (databaseUrl: string): DatabaseTarget => {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('[db-preflight] DATABASE_URL is not a valid URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(
      `[db-preflight] DATABASE_URL must use postgres/postgresql protocol (received ${parsed.protocol}).`,
    );
  }

  const host = parsed.hostname;
  const port = Number(parsed.port || 5432);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, '') || 'postgres');
  const sslMode = parsed.searchParams.get('sslmode');

  if (!host) {
    throw new Error('[db-preflight] DATABASE_URL must include a host.');
  }
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error(`[db-preflight] DATABASE_URL has invalid port (${parsed.port}).`);
  }

  return { host, port, database, sslMode };
};

export const resolveScriptRunProfile = (raw = process.env.CMS_RUN_PROFILE): ScriptRunProfile => {
  const value = raw?.trim().toLowerCase();
  if (!value) return 'auto';
  if (value === 'local' || value === 'prod' || value === 'auto') return value;
  throw new Error(
    `[db-preflight] Invalid CMS_RUN_PROFILE=${raw}. Use one of: auto, local, prod.`,
  );
};

const buildContextError = ({
  runProfile,
  runtime,
  target,
}: {
  runProfile: ScriptRunProfile;
  runtime: RuntimeContext;
  target: DatabaseTarget;
}): string | null => {
  if (runtime === 'host' && isDockerNetworkAlias(target.host)) {
    return [
      `[db-preflight] profile=${runProfile} on host cannot target Docker-internal aliases.`,
      `Detected host=${target.host}.`,
      'Run the script inside Docker (`docker compose run --rm cms ...`) or change DATABASE_URL to a host-reachable endpoint.',
    ].join(' ');
  }

  if (runProfile === 'prod') {
    if (isLocalHost(target.host)) {
      return [
        '[db-preflight] profile=prod cannot target localhost.',
        `Detected ${target.host}:${target.port}/${target.database}.`,
        'Use a non-local production database endpoint.',
      ].join(' ');
    }
  }

  if (runProfile === 'local') {
    if (runtime === 'host' && isDockerNetworkAlias(target.host)) {
      return [
        '[db-preflight] profile=local on host cannot reach Docker service aliases.',
        `Detected host=${target.host}.`,
        'Use localhost with the host-mapped port (docker-compose maps Postgres to localhost:5433).',
      ].join(' ');
    }
    if (runtime === 'container' && isLocalHost(target.host)) {
      return [
        '[db-preflight] profile=local in container should not target localhost.',
        `Detected host=${target.host}.`,
        'Use the Docker service alias (usually db:5432) from inside the compose network.',
      ].join(' ');
    }
  }

  return null;
};

const buildWarnings = ({
  runProfile,
  runtime,
  target,
}: {
  runProfile: ScriptRunProfile;
  runtime: RuntimeContext;
  target: DatabaseTarget;
}): string[] => {
  const warnings: string[] = [];

  if (runProfile === 'auto') {
    warnings.push(
      '[db-preflight] CMS_RUN_PROFILE is not set; using auto mode. Prefer explicit local/prod script variants.',
    );
  }

  if (runtime === 'host' && isLocalHost(target.host) && target.port === 5432) {
    warnings.push(
      '[db-preflight] Host runtime targeting localhost:5432. In this repo Docker maps Postgres to localhost:5433.',
    );
  }

  return warnings;
};

const buildConnectionHint = ({
  runtime,
  target,
  code,
}: {
  runtime: RuntimeContext;
  target: DatabaseTarget;
  code: string | undefined;
}): string => {
  if (code === 'ECONNREFUSED') {
    if (runtime === 'host' && isDockerNetworkAlias(target.host)) {
      return 'Host runtime cannot resolve Docker-only host aliases. Either run the script in Docker or change DATABASE_URL host to localhost:5433.';
    }
    if (runtime === 'host' && isLocalHost(target.host) && target.port === 5432) {
      return 'If you are using docker-compose, Postgres is exposed on localhost:5433. Update DATABASE_URL or start the expected local Postgres instance on 5432.';
    }
    return 'The target Postgres service is not accepting TCP connections. Verify host/port and that the service is running.';
  }

  if (code === 'ENOTFOUND') {
    return 'Database host could not be resolved. Check DATABASE_URL host and DNS/network context.';
  }

  if (code === 'ETIMEDOUT') {
    return 'Database connection timed out. Check routing/firewall rules and security groups.';
  }

  return 'Unable to connect to Postgres. Verify DATABASE_URL, network context, and credentials.';
};

const runConnectivityProbe = async ({
  databaseUrl,
  timeoutMs,
  runtime,
  target,
  requiredTables,
  scriptName,
}: {
  databaseUrl: string;
  timeoutMs: number;
  runtime: RuntimeContext;
  target: DatabaseTarget;
  requiredTables: string[];
  scriptName: string;
}) => {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    statement_timeout: timeoutMs,
  });

  try {
    await client.connect();
    await client.query('select 1 as ok');

    if (requiredTables.length) {
      const tableNames = requiredTables.map((value) => value.trim()).filter(Boolean);
      if (tableNames.length) {
        const tableResult = await client.query<{
          table_name: string;
        }>(
          `
            select table_name
            from information_schema.tables
            where table_schema = 'public'
              and table_name = any($1::text[])
          `,
          [tableNames],
        );

        const existing = new Set(tableResult.rows.map((row) => row.table_name));
        const missing = tableNames.filter((tableName) => !existing.has(tableName));
        if (missing.length) {
          throw new Error(
            [
              `[db-preflight] Missing required tables for ${scriptName}: ${missing.join(', ')}.`,
              'Run Payload migrations first: `pnpm --dir cms payload migrate -- --config ./payload.config.ts`.',
            ].join(' '),
          );
        }
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[db-preflight] Missing required tables')) {
      throw error;
    }
    const maybeError = error as { code?: string; message?: string };
    const detail = maybeError?.message ? ` (${maybeError.message})` : '';
    const hint = buildConnectionHint({ runtime, target, code: maybeError?.code });
    throw new Error(
      `[db-preflight] Connectivity probe failed${detail} ${hint}`.trim(),
    );
  } finally {
    await client.end().catch(() => null);
  }
};

export const runDatabasePreflight = async ({
  runProfile,
  scriptName,
  timeoutMs = 5000,
  skipConnectivityCheck = false,
  requiredTables = [],
}: RunDatabasePreflightOptions): Promise<DatabasePreflightResult> => {
  const effectiveProfile = runProfile ?? resolveScriptRunProfile();
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      `[db-preflight] DATABASE_URL is not set before running ${scriptName}.`,
    );
  }

  const runtime = detectRuntimeContext();
  const target = parseDatabaseTarget(databaseUrl);
  const contextError = buildContextError({ runProfile: effectiveProfile, runtime, target });
  if (contextError) {
    throw new Error(contextError);
  }

  const warnings = buildWarnings({ runProfile: effectiveProfile, runtime, target });
  if (!skipConnectivityCheck) {
    await runConnectivityProbe({
      databaseUrl,
      timeoutMs,
      runtime,
      target,
      requiredTables,
      scriptName,
    });
  }

  return {
    runProfile: effectiveProfile,
    runtime,
    target,
    warnings,
  };
};
