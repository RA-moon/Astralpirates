process.env.PAYLOAD_DB_PUSH = process.env.PAYLOAD_DB_PUSH ?? 'false';

import { Client } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

import { loadDefaultEnvOrder } from '@/config/loadEnv';

import {
  resetCachedMasterKey,
  sealPrivateKey,
  unsealPrivateKey,
} from '@/src/services/messaging/encryption';

type CliOptions = {
  from?: string;
  to?: string;
};

const HEX_KEY_REGEX = /^[0-9a-fA-F]{64}$/;

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const cmsDir = path.resolve(dirname, '../../..');
const repoRoot = path.resolve(cmsDir, '..');

loadDefaultEnvOrder(repoRoot, cmsDir);

const requireEnv = (value: string | undefined, name: string): string => {
  const trimmed = value?.trim();
  if (trimmed) return trimmed;
  throw new Error(`[env] ${name} must be set before rotating messaging keys.`);
};

const parseArgs = (): CliOptions => {
  const options: CliOptions = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--from=')) {
      options.from = arg.slice('--from='.length);
    } else if (arg.startsWith('--to=')) {
      options.to = arg.slice('--to='.length);
    }
  }
  return options;
};

const toKeyBuffer = (hex: string | undefined, label: string): Buffer => {
  if (!hex || !HEX_KEY_REGEX.test(hex.trim())) {
    throw new Error(
      `[messaging:rotate-keys] ${label} must be a 32-byte hex string (64 characters).`,
    );
  }
  return Buffer.from(hex.trim(), 'hex');
};

const run = async () => {
  const args = parseArgs();
  const oldKey = toKeyBuffer(args.from ?? process.env.MESSAGING_MASTER_KEY_PREVIOUS, 'previous key');
  const newKey = toKeyBuffer(args.to ?? process.env.MESSAGING_MASTER_KEY, 'new key');

  if (Buffer.compare(oldKey, newKey) === 0) {
    console.warn('[messaging:rotate-keys] Previous and new keys are identical. Nothing to do.');
    return;
  }

  resetCachedMasterKey();

  const connectionString = requireEnv(process.env.DATABASE_URL, 'DATABASE_URL');
  const client = new Client({ connectionString });
  await client.connect();

  try {
    const result = await client.query<{
      id: number;
      sealed_private_key: Buffer;
      version: number;
    }>('SELECT id, sealed_private_key, version FROM public.message_encryption_keys ORDER BY id ASC');

    if (result.rowCount === 0) {
      console.log('[messaging:rotate-keys] No encryption keys found.');
      return;
    }

    let rotated = 0;
    const failures: Array<{ id: number; error: unknown }> = [];

    for (const row of result.rows) {
      try {
        const unlocked = await unsealPrivateKey({
          sealed: row.sealed_private_key,
          masterKeyOverride: oldKey,
        });
        const resealed = await sealPrivateKey({
          privateKey: unlocked,
          masterKeyOverride: newKey,
        });
        await client.query(
          `
            UPDATE public.message_encryption_keys
            SET sealed_private_key = $1,
                version = $2,
                rotated_at = NOW(),
                updated_at = NOW()
            WHERE id = $3
          `,
          [resealed, row.version + 1, row.id],
        );
        rotated += 1;
      } catch (error) {
        failures.push({ id: row.id, error });
      }
    }

    console.log(`[messaging:rotate-keys] Re-sealed ${rotated} key(s).`);
    if (failures.length) {
      failures.forEach(({ id, error }) => {
        console.error('[messaging:rotate-keys] Failed to rotate key', { id, error });
      });
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
};

run().catch((error) => {
  console.error('[messaging:rotate-keys] Fatal error', error);
  process.exitCode = 1;
});
