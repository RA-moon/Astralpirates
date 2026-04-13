import { expect, type Locator, type Page } from '@playwright/test';

const EDITOR_OPEN_TIMEOUT_MS = 30_000;
const PANEL_STEP_TIMEOUT_MS = 2_000;

const enableSwitchIfPresent = async (
  panel: Locator,
  label: string,
  options?: { requireEnabled?: boolean },
) => {
  const control = panel.getByRole('switch', { name: new RegExp(`^${label}$`, 'i') }).first();
  if (!(await control.isVisible().catch(() => false))) {
    return;
  }

  if (options?.requireEnabled ?? false) {
    await expect(control).toBeEnabled({ timeout: PANEL_STEP_TIMEOUT_MS });
  } else if (!(await control.isEnabled().catch(() => false))) {
    return;
  }

  if ((await control.getAttribute('aria-checked')) === 'true') {
    return;
  }

  await control.click();
  await expect(control).toHaveAttribute('aria-checked', 'true', {
    timeout: PANEL_STEP_TIMEOUT_MS,
  });
};

const ensureFlyoutExpandedWithEditAction = async (page: Page) => {
  const trigger = page.getByRole('button', { name: /^Privileges\b/i }).first();
  await expect(trigger).toBeVisible({ timeout: EDITOR_OPEN_TIMEOUT_MS });

  await expect(async () => {
    const isExpanded = (await trigger.getAttribute('aria-expanded')) === 'true';
    if (!isExpanded) {
      await trigger.click();
    }

    const panel = page.locator('#privileged-controls-flyout-panel').first();
    await expect(panel).toBeVisible({ timeout: PANEL_STEP_TIMEOUT_MS });

    const editButton = panel.getByRole('button', { name: 'Edit page' }).first();
    if (await editButton.isVisible().catch(() => false)) {
      return;
    }

    await enableSwitchIfPresent(panel, 'Admin visibility');

    if (await editButton.isVisible().catch(() => false)) {
      return;
    }

    await enableSwitchIfPresent(panel, 'Admin edit', { requireEnabled: true });

    await expect(editButton).toBeVisible({
      timeout: PANEL_STEP_TIMEOUT_MS,
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
