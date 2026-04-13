import { test, expect } from '@playwright/test';

test.describe('Menu object canvas interactions', () => {
  test('opens ship layout drawer when clicking the menu object in the canvas overlay', async ({
    page,
  }) => {
    await page.goto('/');

    const menuCanvas = page.locator('#bg-menu-wrap canvas').first();
    await expect(menuCanvas).toBeVisible();

    const drawer = page.locator('.site-menu-drawer.ui-drawer');
    await expect(drawer).toHaveCount(0);

    const clickMenuObject = async () => {
      const hitPoint = await page.evaluate(() => {
        const root = document.documentElement;
        const styles = getComputedStyle(root);
        const menuObjectPx =
          Number.parseFloat(styles.getPropertyValue('--size-runtime-menu-object-px')) || 72;
        const flagReferencePx =
          Number.parseFloat(styles.getPropertyValue('--size-runtime-avatar-hero-px')) || 132;
        const margin = flagReferencePx * 0.5 || menuObjectPx * 0.5;
        return {
          x: Math.max(8, window.innerWidth - margin),
          y: Math.max(8, margin),
        };
      });

      await page.mouse.click(hitPoint.x, hitPoint.y);
    };

    let lastError: unknown = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await clickMenuObject();
      try {
        await expect(drawer).toHaveCount(1, { timeout: 3_000 });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) throw lastError;

    await expect(drawer).toHaveCount(1);
    await expect(page.getByLabel('Ship layout diagram')).toBeVisible();
  });
});
