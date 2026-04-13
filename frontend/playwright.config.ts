import { defineConfig, devices } from '@playwright/test';
import { loadPlaywrightEnv } from './test/e2e/support/env';

loadPlaywrightEnv();

const resolveNumber = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const baseURL = process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:8080';
const reporter = process.env.CI ? 'github' : 'list';
const workers =
  Number.isFinite(Number.parseInt(process.env.PLAYWRIGHT_WORKERS ?? '', 10)) &&
  Number.parseInt(process.env.PLAYWRIGHT_WORKERS ?? '', 10) > 0
    ? Number.parseInt(process.env.PLAYWRIGHT_WORKERS ?? '', 10)
    : process.env.CI
      ? 1
      : undefined;

export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: true,
  globalSetup: './test/e2e/support/globalSetup.ts',
  reporter,
  retries: process.env.CI ? 2 : 0,
  workers,
  timeout: resolveNumber(process.env.PLAYWRIGHT_TEST_TIMEOUT, process.env.CI ? 180_000 : 60_000),
  expect: {
    timeout: resolveNumber(process.env.PLAYWRIGHT_EXPECT_TIMEOUT, process.env.CI ? 20_000 : 10_000),
  },
  outputDir: 'test-results/e2e',
  use: {
    baseURL,
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    video: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
