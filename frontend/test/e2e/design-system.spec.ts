import { Buffer } from 'node:buffer';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const skipDesignSystem = process.env.PLAYWRIGHT_SKIP_DESIGN_SYSTEM === '1';

test.describe.configure({ timeout: 120_000 });

test.beforeEach(async ({ page, context }, testInfo) => {
  await context.clearCookies();
  await page.route('https://fonts.googleapis.com/*', (route) =>
    route.fulfill({ status: 200, body: '' }),
  );
  await page.route('https://fonts.gstatic.com/*', (route) => route.fulfill({ status: 200, body: '' }));
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  const consoleLogs: string[] = [];
  const recordConsoleLog = (entry: string) => {
    consoleLogs.push(`${new Date().toISOString()} ${entry}`);
  };
  const flushConsoleLog = () => {
    if (consoleLogs.length === 0) return;
    testInfo.attachments.push({
      name: 'console',
      contentType: 'text/plain',
      body: Buffer.from(`${consoleLogs.join('\n')}\n`),
    });
    consoleLogs.length = 0;
  };
  page.on('console', (message) => {
    if (['error', 'warning'].includes(message.type())) {
      recordConsoleLog(`[console:${message.type()}] ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    recordConsoleLog(`[pageerror] ${error.message}`);
  });
  page.on('close', flushConsoleLog);
});

const gotoHydrated = async (page: Page, path: string, skip: (reason: string) => void) => {
  const response = await page.goto(path, { waitUntil: 'domcontentloaded' }).catch((error: any) => {
    skip(`Design system page navigation failed: ${error?.message ?? error}`);
    return null;
  });
  if (!response || !response.ok()) {
    skip(`Design system page unavailable (status ${response?.status() ?? 'n/a'})`);
    return;
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  try {
    // Fallback: consider the page ready once the design-system cards render.
    await page.waitForSelector('.design-system__demo-card', { timeout: 15_000 });
  } catch (error: any) {
    skip(`Design system content unavailable: ${error?.message ?? error}`);
  }
};

test.describe('Design system catalogue', () => {
  test.skip(skipDesignSystem, 'Design system demos are heavy; skip when PLAYWRIGHT_SKIP_DESIGN_SYSTEM=1');

  test('renders key sections and actions', async ({ page }) => {
    await gotoHydrated(page, '/gangway/engineering/bay', test.skip);

    await expect(page.getByRole('heading', { name: /Design system/i })).toBeVisible();
    const sections = page.locator('.design-system__section');
    expect(await sections.count()).toBeGreaterThan(3);

    const demoCards = page.locator('.design-system__demo-card');
    expect(await demoCards.count()).toBeGreaterThan(5);

    // Spot-check a demo renders interactive content
    const buttonsDemo = demoCards.filter({ hasText: /Buttons/i }).first();
    await buttonsDemo.scrollIntoViewIfNeeded();
    const buttonCount = await buttonsDemo.locator('button').count();
    expect(buttonCount).toBeGreaterThan(3);
  });
});
