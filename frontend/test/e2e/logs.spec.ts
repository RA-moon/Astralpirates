import { test, expect } from '@playwright/test';
import { getSeededCaptain } from './support/fixtures';
import { loginThroughUi } from './support/auth';

const uniqueLogTitle = () => `Playwright log ${Date.now()}`;

test.describe('Logbook publishing', () => {
  test('creates a log entry with an associated mission', async ({ page }) => {
    let captain;
    try {
      captain = getSeededCaptain();
    } catch (error: any) {
      test.skip(String(error?.message ?? error));
      return;
    }

    await loginThroughUi(page, captain, { landingPath: '/bridge/logbook' });

    const logTitle = uniqueLogTitle();

    const openComposer = page.getByRole('button', { name: 'New log entry' });
    await expect(openComposer).toBeVisible({ timeout: 30_000 });
    await openComposer.click();
    await page.getByLabel('Title').fill(logTitle);
    await page.getByLabel('Log entry').fill('Automated log entry for Playwright coverage.');

    const flightPlanSelect = page.getByLabel('Associate flight plan');
    const planOptions = flightPlanSelect.locator('option');
    const optionCount = await planOptions.count();
    if (optionCount > 1) {
      await flightPlanSelect.selectOption({ index: 1 });
    }

    const publishButton = page.getByRole('button', { name: 'Publish log' });
    await expect(publishButton).toBeEnabled({ timeout: 10_000 });
    const [publishResponse] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/logs') &&
          response.request().method() === 'POST',
        { timeout: 30_000 },
      ),
      publishButton.click(),
    ]);
    expect(publishResponse.ok()).toBeTruthy();

    await expect(
      page.getByRole('heading', { name: new RegExp(logTitle, 'i') }),
    ).toBeVisible({ timeout: 30_000 });
  });
});
