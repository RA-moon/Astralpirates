import { fileURLToPath } from 'node:url';
import { defineNuxtConfig } from 'nuxt/config';
import type { Plugin } from 'vite';

import { loadDefaultEnvOrder } from '../config/loadEnv';
import { resolveFrontendEnv } from '../config/envSchema';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));
const frontendDir = fileURLToPath(new URL('.', import.meta.url));
const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));
const domainsDir = fileURLToPath(new URL('./app/domains', import.meta.url));
const docsDir = fileURLToPath(new URL('../docs', import.meta.url));
const nodeModulesDir = fileURLToPath(new URL('../node_modules', import.meta.url));

loadDefaultEnvOrder(projectRoot, frontendDir);

const defaultDevHost = process.env.NUXT_HOST ?? 'localhost';
const parsedPort = Number.parseInt(process.env.NUXT_PORT ?? '', 10);
const defaultDevPort = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 8080;

process.env.NUXT_HOST = defaultDevHost;
process.env.NUXT_PORT = String(defaultDevPort);

const nuxtCommand = process.env.NUXT_COMMAND ?? '';
const skipStrictEnvChecks = process.env.NODE_ENV === 'production' && nuxtCommand === 'prepare';
const {
  astralApiBase: serverAstralApiBase,
  publicAstralApiBase,
  payloadSecret,
} = resolveFrontendEnv({
  enforceStrict: skipStrictEnvChecks ? false : undefined,
});
const fallbackApiBase = 'http://localhost:3000';
const enforceProdFrontendConfig = process.env.NODE_ENV === 'production' && !skipStrictEnvChecks;
const devtoolsEnv = process.env.NUXT_DEVTOOLS ?? '';
const enableDevtools = ['1', 'true', 'yes', 'on'].includes(devtoolsEnv.toLowerCase().trim());
const clientEventSecret =
  process.env.CLIENT_EVENT_SECRET ??
  process.env.NUXT_CLIENT_EVENT_SECRET ??
  payloadSecret ??
  '';
const clientEventCookieName = process.env.CLIENT_EVENT_COOKIE ?? 'astral_client_event';
const clientEventWindowMs = Number.parseInt(process.env.CLIENT_EVENT_WINDOW_MS ?? '60000', 10);
const clientEventMax = Number.parseInt(process.env.CLIENT_EVENT_MAX ?? '60', 10);
const resolvedClientEventWindow =
  Number.isFinite(clientEventWindowMs) && clientEventWindowMs > 0 ? clientEventWindowMs : 60_000;
const resolvedClientEventMax =
  Number.isFinite(clientEventMax) && clientEventMax > 0 ? clientEventMax : 60;
const parseBooleanEnvFlag = (value: string | undefined, fallback = false): boolean => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};
const disableBackground =
  parseBooleanEnvFlag(process.env.NUXT_PUBLIC_DISABLE_BACKGROUND, false);
const avatarTriModeEnabled = parseBooleanEnvFlag(
  process.env.NUXT_PUBLIC_AVATAR_TRI_MODE_ENABLED,
  false,
);
const flagModelReplacementEnabled = parseBooleanEnvFlag(
  process.env.NUXT_PUBLIC_FLAG_MODEL_REPLACEMENT_ENABLED,
  false,
);
const e2eKeepSessionToken = parseBooleanEnvFlag(
  process.env.NUXT_PUBLIC_E2E_KEEP_SESSION_TOKEN,
  false,
);

const expectedSelfOrigins = new Set<string>([
  `http://${defaultDevHost}:${defaultDevPort}`,
  `http://localhost:${defaultDevPort}`,
  `http://127.0.0.1:${defaultDevPort}`,
  `http://0.0.0.0:${defaultDevPort}`,
]);

const shouldUseDevProxy =
  process.env.NODE_ENV !== 'production' && !serverAstralApiBase && !publicAstralApiBase;
const devProxyPath = '/cms-api';
const devProxyTarget = process.env.NUXT_DEV_CMS_PROXY_TARGET ?? fallbackApiBase;
const resolvedServerAstralApiBase = shouldUseDevProxy
  ? devProxyPath
  : serverAstralApiBase || fallbackApiBase;
const resolvedPublicAstralApiBase = shouldUseDevProxy
  ? devProxyPath
  : publicAstralApiBase || fallbackApiBase;
const isAbsoluteUrl = (value: string | undefined) =>
  typeof value === 'string' && /^https?:\/\//i.test(value);

try {
  if (isAbsoluteUrl(resolvedPublicAstralApiBase)) {
    const apiOrigin = new URL(resolvedPublicAstralApiBase);
    apiOrigin.hash = '';
    apiOrigin.pathname = '';
    apiOrigin.search = '';
    const normalized = apiOrigin.toString().replace(/\/$/, '');
    if (expectedSelfOrigins.has(normalized)) {
      const misconfigurationMessage =
        `[nuxt] astralApiBase (${resolvedPublicAstralApiBase}) matches the frontend server origin (${normalized}). ` +
        'Requests will hit Nuxt instead of the CMS; set ASTRAL_API_BASE / NUXT_PUBLIC_ASTRAL_API_BASE to the CMS origin (default http://localhost:3000).';
      if (enforceProdFrontendConfig) {
        throw new Error(misconfigurationMessage);
      }
      // eslint-disable-next-line no-console
      console.warn(misconfigurationMessage);
    }
    if (
      !shouldUseDevProxy &&
      enforceProdFrontendConfig &&
      (!resolvedPublicAstralApiBase ||
        resolvedPublicAstralApiBase === fallbackApiBase ||
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(resolvedPublicAstralApiBase))
    ) {
      throw new Error(
        `[nuxt] astralApiBase (${
          resolvedPublicAstralApiBase || 'undefined'
        }) is using the local fallback. ` +
          'Set ASTRAL_API_BASE and NUXT_PUBLIC_ASTRAL_API_BASE to the public CMS origin before generating the static site.',
      );
    }
  }
} catch {
  // Ignore invalid URL; Nuxt will surface its own configuration error later.
}

const devProxyConfig = shouldUseDevProxy
  ? {
      [devProxyPath]: {
        target: devProxyTarget,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/cms-api/, ''),
      },
    }
  : undefined;

// https://nuxt.com/docs/api/configuration/nuxt-config
const htmlCacheControl = 'public, max-age=0, must-revalidate';
const crawlerHomeRobotsHeader = 'index, nofollow';
const crawlerBlockedRobotsHeader = 'noindex, nofollow, noarchive, nosnippet, noimageindex';
const designSystemRoutes = ['/gangway/engineering/bay', '/design-system'];
const chunkMetadataFilename = '_nuxt/chunk-metadata.json';

type ClientChunkMetadataEntry = {
  dynamicImports: string[];
  imports: string[];
  isDynamicEntry: boolean;
  isEntry: boolean;
  modules: string[];
  tags: string[];
};

type ClientChunkMetadataManifest = {
  chunks: Record<string, ClientChunkMetadataEntry>;
  generatedAt: string;
};

const classifyChunkTags = (modules: string[]): string[] => {
  const tags = new Set<string>();
  if (modules.some((moduleId) => moduleId.includes('/app/background/'))) {
    tags.add('background-source');
  }
  if (
    modules.some(
      (moduleId) =>
        moduleId.includes('node_modules/three') ||
        moduleId.includes('three/examples/jsm/libs/draco'),
    )
  ) {
    tags.add('background-vendor');
  }
  return [...tags];
};

const createChunkMetadataManifestPlugin = (): Plugin => ({
  name: 'astral-chunk-metadata-manifest',
  generateBundle(_options, bundle) {
    const chunks: Record<string, ClientChunkMetadataEntry> = {};
    for (const [fileName, emitted] of Object.entries(bundle)) {
      if (emitted.type !== 'chunk') continue;
      if (!fileName.endsWith('.js')) continue;
      const modules = Object.keys(emitted.modules).sort();
      chunks[fileName] = {
        dynamicImports: [...emitted.dynamicImports].sort(),
        imports: [...emitted.imports].sort(),
        isDynamicEntry: emitted.isDynamicEntry,
        isEntry: emitted.isEntry,
        modules,
        tags: classifyChunkTags(modules),
      };
    }

    const manifest: ClientChunkMetadataManifest = {
      chunks,
      generatedAt: new Date().toISOString(),
    };

    this.emitFile({
      fileName: chunkMetadataFilename,
      source: `${JSON.stringify(manifest, null, 2)}\n`,
      type: 'asset',
    });
  },
});

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: true,
  devtools: { enabled: enableDevtools },
  srcDir: 'app',
  css: [
    '~/styles/tokens.css',
    '@astralpirates/shared/theme/themes/default.css',
    '@astralpirates/shared/theme/themes/retro.css',
    '@astralpirates/shared/theme/themes/partner-alpha.css',
  ],
  plugins: ['~/plugins/hydration-flag.client'],
  modules: ['@pinia/nuxt'],
  postcss: {
    plugins: {
      'postcss-custom-media': {},
    },
  },
  alias: {
    '~/domains': domainsDir,
    '#docs': docsDir,
  },
  pinia: {
    storesDirs: ['./app/stores'],
  },
  runtimeConfig: {
    astralApiBase: resolvedServerAstralApiBase,
    payloadSecret: payloadSecret ?? '',
    clientEvents: {
      secret: clientEventSecret,
      cookieName: clientEventCookieName,
      rateLimit: {
        windowMs: resolvedClientEventWindow,
        max: resolvedClientEventMax,
      },
    },
    public: {
      astralApiBase: resolvedPublicAstralApiBase,
      disableBackground,
      avatarTriModeEnabled,
      flagModelReplacementEnabled,
      e2eKeepSessionToken,
    },
  },
  devServer: {
    host: process.env.NUXT_HOST,
    port: Number.parseInt(process.env.NUXT_PORT ?? String(defaultDevPort), 10),
  },
  routeRules: {
    '/': {
      ssr: true,
      prerender: true,
      headers: {
        'cache-control': htmlCacheControl,
        'x-robots-tag': crawlerHomeRobotsHeader,
      },
    },
    '/bridge': {
      ssr: true,
      prerender: false,
      headers: {
        'cache-control': htmlCacheControl,
        'x-robots-tag': crawlerBlockedRobotsHeader,
      },
    },
    '/bridge/**': {
      ssr: true,
      prerender: false,
      headers: {
        'cache-control': htmlCacheControl,
        'x-robots-tag': crawlerBlockedRobotsHeader,
      },
    },
    '/gangway': {
      ssr: true,
      prerender: false,
      headers: {
        'cache-control': htmlCacheControl,
        'x-robots-tag': crawlerBlockedRobotsHeader,
      },
    },
    '/gangway/**': {
      ssr: true,
      prerender: false,
      headers: {
        'cache-control': htmlCacheControl,
        'x-robots-tag': crawlerBlockedRobotsHeader,
      },
    },
    '/logbook/**': {
      ssr: true,
      prerender: false,
      headers: {
        'cache-control': htmlCacheControl,
        'x-robots-tag': crawlerBlockedRobotsHeader,
      },
    },
    '/flight-plans/**': {
      ssr: true,
      prerender: false,
      headers: {
        'cache-control': htmlCacheControl,
        'x-robots-tag': crawlerBlockedRobotsHeader,
      },
    },
    '/enlist/**': {
      ssr: true,
      prerender: false,
      headers: {
        'cache-control': htmlCacheControl,
        'x-robots-tag': crawlerBlockedRobotsHeader,
      },
    },
    '/design-system/**': {
      ssr: true,
      prerender: false,
      headers: {
        'cache-control': htmlCacheControl,
        'x-robots-tag': crawlerBlockedRobotsHeader,
      },
    },
    '/dev/**': {
      ssr: true,
      prerender: false,
      headers: {
        'cache-control': htmlCacheControl,
        'x-robots-tag': crawlerBlockedRobotsHeader,
      },
    },
    '/**': {
      ssr: true,
      prerender: false,
      headers: {
        'cache-control': htmlCacheControl,
        'x-robots-tag': crawlerBlockedRobotsHeader,
      },
    },
  },
  nitro: {
    prerender: {
      crawlLinks: false,
      routes: designSystemRoutes,
    },
    devProxy: devProxyConfig,
  },
  vite: {
    server: {
      fs: {
        allow: [frontendDir, sharedDir, projectRoot, nodeModulesDir, docsDir],
      },
      watch: {
        ignored: [
          '**/backups/**',
          '**/cms/**',
          '**/deploy/**',
          '**/docs/**',
          '**/docker/**',
          '**/infrastructure/**',
          '**/node_modules/**',
        ],
      },
    },
    resolve: {
      alias: {
        '~/domains': domainsDir,
        '#docs': docsDir,
      },
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        plugins: [createChunkMetadataManifestPlugin()],
        output: {
          manualChunks(id) {
            const targetsThree = id.includes('node_modules/three');
            if (targetsThree || id.includes('three/examples/jsm/libs/draco')) {
              return 'background-vendor';
            }
            return undefined;
          },
        },
      },
    },
  },
});
