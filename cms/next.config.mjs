import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { withPayload } from '@payloadcms/next/withPayload';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const NODE_ENV = process.env.NODE_ENV ?? 'development';
const DIST_DIR =
  process.env.NEXT_DIST_DIR ?? (NODE_ENV === 'production' ? '.next' : '.next-dev');
const DEV_DEFAULT_ORIGIN = 'http://localhost:8080';

const sanitizeOrigins = (raw) =>
  raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const configuredOrigins = sanitizeOrigins(
  process.env.PAYLOAD_PUBLIC_CORS_ORIGIN ??
    process.env.CLIENT_ORIGIN ??
    process.env.FRONTEND_ORIGIN ??
    'https://astralpirates.com',
);

if (NODE_ENV !== 'production') {
  configuredOrigins.unshift(DEV_DEFAULT_ORIGIN);
}

const uniqueOrigins = Array.from(new Set(configuredOrigins));
const headerOrigin =
  NODE_ENV === 'production'
    ? uniqueOrigins.find((origin) => origin !== '*') ?? DEV_DEFAULT_ORIGIN
    : DEV_DEFAULT_ORIGIN;

const nextConfig = withPayload(
  {
    reactStrictMode: true,
    typedRoutes: true,
    skipTrailingSlashRedirect: true,
    distDir: DIST_DIR,
    env: {
      PAYLOAD_CONFIG_PATH: path.resolve(dirname, 'payload.config.ts'),
    },
    outputFileTracingRoot: path.join(dirname, '..'),
    experimental: {
      externalDir: true,
    },
    webpack: (config) => {
      config.resolve.alias = config.resolve.alias ?? {};
      // Ensure Next resolves the workspace-root alias used across API routes (e.g., '@/app/lib/payload')
      config.resolve.alias['@'] = path.resolve(dirname);
      config.resolve.alias['@astral/shared'] = path.resolve(dirname, '../shared');
      return config;
    },
    async headers() {
      const corsHeaders = [
        { key: 'Access-Control-Allow-Origin', value: headerOrigin },
        { key: 'Access-Control-Allow-Credentials', value: 'true' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
        { key: 'Vary', value: 'Origin' },
      ];

      return [
        {
          source: '/media/avatars/:path*',
          headers: corsHeaders,
        },
        {
          source: '/data/:path*',
          headers: corsHeaders,
        },
      ];
    },
    eslint: {
      // The repo uses eslint outside of Next; skip duplicate linting during builds.
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: process.env.CI === 'true' ? false : true,
    },
  },
  {
    devBundleServerPackages: false,
  },
);

export default nextConfig;
