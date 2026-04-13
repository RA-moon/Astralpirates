import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

dotenv.config({ path: path.join(dirname, '.env') });

envGuard('DATABASE_URL');

export default defineConfig({
  schema: './src/drizzle-schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

function envGuard(name: string): asserts process is NodeJS.Process {
  if (!process.env[name]) {
    throw new Error(`Missing required environment variable ${name}`);
  }
}
