import path from 'node:path';
import { defineConfig } from 'vitest/config';

const projectRoot = new URL('./', import.meta.url).pathname;

export default defineConfig({
  test: {
    environment: 'node',
    watch: false,
    setupFiles: ['test/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      exclude: ['**/node_modules/**', '**/test/**', '**/test/mocks/**', '**/*.config.ts'],
      thresholds: {
        lines: 25,
        functions: 20,
        branches: 15,
        statements: 25,
      },
    },
  },
  resolve: {
    alias: {
      '@': projectRoot,
      'server-only': path.resolve(projectRoot, 'test/mocks/server-only.ts'),
    },
  },
});
