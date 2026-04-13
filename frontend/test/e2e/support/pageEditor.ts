import { expect, type Page } from '@playwright/test';

const EDITOR_OPEN_TIMEOUT_MS = 30_000;

const ensureFlyoutExpandedWithEditAction = async (page: Page) => {
  const trigger = page.getByRole('button', { name: /^Privileges$/i }).first();
  await expect(trigger).toBeVisible({ timeout: EDITOR_OPEN_TIMEOUT_MS });

  await expect(async () => {
    const isExpanded = (await trigger.getAttribute('aria-expanded')) === 'true';
    if (!isExpanded) {
      await trigger.click();
    }

    const panel = page.locator('#privileged-controls-flyout-panel').first();
    await expect(panel).toBeVisible({ timeout: 2_000 });
    await expect(panel.getByRole('button', { name: 'Edit page' }).first()).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: EDITOR_OPEN_TIMEOUT_MS, intervals: [400, 800, 1_600] });
};

export const openPageEditor = async (page: Page) => {
  const editorHeading = page.getByRole('heading', { name: 'Edit page' });
  if (await editorHeading.isVisible().catch(() => false)) {
    return;
  }

  const directEditButton = page.getByRole('button', { name: 'Edit page' }).first();
  if (await directEditButton.isVisible().catch(() => false)) {
    await directEditButton.click();
    await expect(editorHeading).toBeVisible({ timeout: EDITOR_OPEN_TIMEOUT_MS });
    return;
  }

  await ensureFlyoutExpandedWithEditAction(page);
  await page
    .locator('#privileged-controls-flyout-panel')
    .first()
    .getByRole('button', { name: 'Edit page' })
    .first()
    .click();
  await expect(editorHeading).toBeVisible({ timeout: EDITOR_OPEN_TIMEOUT_MS });
};

