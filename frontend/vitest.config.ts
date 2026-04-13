import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import tsconfigPaths from 'vite-tsconfig-paths';

const resolvePath = (p: string) => path.resolve(fileURLToPath(new URL('.', import.meta.url)), p);
const appRoot = resolvePath('./app');
const domainsRoot = resolvePath('./app/domains');
const logsDir = `${domainsRoot}/logs`;
const logsBarrel = `${domainsRoot}/logs.ts`;
const vitestTsconfig = resolvePath('./tsconfig.vitest.json');

export default defineConfig({
  plugins: [vue(), tsconfigPaths({ projects: [vitestTsconfig], ignoreConfigErrors: true })],
  resolve: {
    alias: [
      { find: /^~\/domains\/logs$/, replacement: logsBarrel },
      { find: /^~\/domains\/logs\//, replacement: `${logsDir}/` },
      { find: /^~\/domains\//, replacement: `${domainsRoot}/` },
      { find: /^~\//, replacement: `${appRoot}/` },
      { find: '~', replacement: appRoot },
      { find: '#imports', replacement: resolvePath('./test/mocks/nuxt-imports.ts') },
      { find: '#app', replacement: resolvePath('./test/mocks/nuxt-app.ts') },
    ],
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
    exclude: ['test/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: [
        '**/node_modules/**',
        '**/test/**',
        '**/test/mocks/**',
        '**/*.config.ts',
        '**/vitest.setup.ts',
      ],
      thresholds: {
        lines: 25,
        functions: 20,
        branches: 15,
        statements: 25,
      },
    },
    // Dockerized runs can be slower; allow extra breathing room for async hooks/tests.
    hookTimeout: 20000,
    testTimeout: 20000,
  },
});
