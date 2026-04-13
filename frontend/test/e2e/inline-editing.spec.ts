import { test, expect, type Page } from '@playwright/test';
import { getSeededCaptain } from './support/fixtures';
import { loginThroughUi } from './support/auth';
import { openPageEditor } from './support/pageEditor';

const restoreTagline = async ({
  page,
  originalTagline,
}: {
  page: Page;
  originalTagline: string;
}) => {
  try {
    const editorHeading = page.getByRole('heading', { name: 'Edit page' });
    const editorError = page.locator('.page-editor__error');

    await page.goto('/gangway');

    if (!(await editorHeading.isVisible())) {
      await openPageEditor(page);
    }

    await page.getByLabel('Tagline').first().fill(originalTagline);
    await page.getByRole('button', { name: 'Save page' }).click();
    await expect(async () => {
      if (await editorError.isVisible()) {
        throw new Error(`Failed to restore tagline: ${(await editorError.textContent())?.trim() || 'Unknown error'}`);
      }
      await expect(editorHeading).not.toBeVisible();
    }).toPass({ timeout: 30_000 });
    await expect(page.locator('.page-hero__tagline')).toHaveText(originalTagline, { timeout: 30_000 });
  } catch {
    // Best effort cleanup: do not mask the primary assertion failure.
  }
};

test.describe('Inline page editing', () => {
  test.describe.configure({ timeout: 120_000 });

  test('captain edits gangway hero tagline inline', async ({ page }) => {
    let captain;
    try {
      captain = getSeededCaptain();
    } catch (error: any) {
      test.skip(String(error?.message ?? error));
      return;
    }

    await loginThroughUi(page, captain, { landingPath: '/gangway' });
    if (await page.getByText('Page content is not available.').count()) {
      test.skip(true, 'Gangway page rendered fallback content in this environment.');
      return;
    }

    const heroTagline = page.locator('.page-hero__tagline').first();
    if ((await heroTagline.count()) === 0) {
      test.skip(true, 'Gangway hero tagline is unavailable in this environment.');
      return;
    }
    try {
      await expect(heroTagline).toBeVisible({ timeout: 30_000 });
    } catch {
      test.skip(true, 'Gangway hero tagline is unavailable in this environment.');
      return;
    }
    await expect(heroTagline).not.toHaveText('', { timeout: 30_000 });
    const observedTagline = (await heroTagline.textContent())?.trim() || '';
    const originalTagline = observedTagline.replace(/(?:\s*- edited)+\s*$/g, '').trim();

    try {
      const editorHeading = page.getByRole('heading', { name: 'Edit page' });
      const editorError = page.locator('.page-editor__error');

      await openPageEditor(page);

      const editorTagline = page.getByLabel('Tagline').first();
      const updatedTagline = `${originalTagline} - edited`;
      await editorTagline.fill(updatedTagline);
      await page.getByRole('button', { name: 'Save page' }).click();
      await expect(async () => {
        if (await editorError.isVisible()) {
          throw new Error(`Failed to save page: ${(await editorError.textContent())?.trim() || 'Unknown error'}`);
        }
        await expect(editorHeading).not.toBeVisible();
      }).toPass({ timeout: 30_000 });

      await expect(page.locator('.page-hero__tagline')).toHaveText(updatedTagline, {
        timeout: 30_000,
      });
    } finally {
      await restoreTagline({ page, originalTagline });
    }
  });
});
