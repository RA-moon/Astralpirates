import { expect, type Page } from '@playwright/test';
import type { SeededAccount } from './fixtures';
import { loginViaApi } from './api';

const isTransientNavigationError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /ERR_ABORTED|frame was detached|navigation.*interrupted|Execution context was destroyed/i.test(
    message,
  );
};

const gotoWithRetry = async (page: Page, path: string, attempts = 3) => {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      return;
    } catch (error: unknown) {
      lastError = error;
      if (!isTransientNavigationError(error) || attempt === attempts) {
        throw error;
      }
      await page.waitForTimeout(300 * attempt);
    }
  }
  throw lastError;
};

const resolveSite = (value: string | undefined): string | null => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.hostname}`.toLowerCase();
  } catch {
    return null;
  }
};

export const hasCrossOriginApiAuthContext = (): boolean => {
  const testSite = resolveSite(process.env.PLAYWRIGHT_TEST_BASE_URL);
  const apiSite = resolveSite(process.env.PLAYWRIGHT_API_BASE ?? process.env.ASTRAL_API_BASE);
  if (!testSite || !apiSite) return false;
  return testSite !== apiSite;
};

export const waitForNuxtReady = async (page: Page) => {
  const timeout = process.env.CI ? 60_000 : 30_000;
  await page.waitForFunction(
    () => {
      const w = window as any;
      return (
        w.__ASTRAL_NUXT_READY__ === true ||
        w.__ASTRAL_HYDRATED__ === true ||
        document.documentElement?.dataset?.astralNuxtReady === 'true' ||
        document.documentElement?.dataset?.astralHydrated === 'true'
      );
    },
    null,
    { timeout },
  );
};

export const waitForAuthenticatedUi = async (page: Page) => {
  await waitForAuthControls(page);
  const flyout = page.locator('#auth-flyout, .auth-flyout');
  const disembarkButton = flyout.locator('button, [role="button"]').filter({ hasText: /disembark/i });
  await expect(disembarkButton).toBeVisible({ timeout: 30_000 });
};

export const waitForAuthControls = async (page: Page) => {
  await waitForNuxtReady(page);
  const flyout = page.locator('#auth-flyout, .auth-flyout');
  const timeout = process.env.CI ? 30_000 : 15_000;
  await expect(flyout).toBeVisible({ timeout });
};

const getAuthFlyout = (page: Page) => page.locator('#auth-flyout, .auth-flyout');
const getAuthDialog = (page: Page) => page.locator('.auth-dialog[role="dialog"]').first();

const ensureEmbarkButtonVisible = async (page: Page) => {
  await waitForAuthControls(page);
  const flyout = getAuthFlyout(page);
  const disembarkButton = flyout.getByRole('button', { name: /disembark/i }).first();
  if (await disembarkButton.isVisible().catch(() => false)) {
    await disembarkButton.click({ timeout: 5_000 });
  }
  const embarkButton = flyout.getByRole('button', { name: /embark/i }).first();
  await expect(embarkButton).toBeVisible({ timeout: 10_000 });
  return embarkButton;
};

export const openLoginDialog = async (page: Page) => {
  const dialog = getAuthDialog(page);

  await expect(async () => {
    const embarkButton = await ensureEmbarkButtonVisible(page);
    await embarkButton.scrollIntoViewIfNeeded().catch(() => null);
    await embarkButton.click({ timeout: 5_000 });
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });

  return dialog;
};

const loginThroughDialog = async (page: Page, account: SeededAccount) => {
  await gotoWithRetry(page, '/');
  const dialog = await openLoginDialog(page);
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  const backToLoginButton = dialog.getByRole('button', { name: /^Back to login$/i }).first();
  if (await backToLoginButton.isVisible().catch(() => false)) {
    await backToLoginButton.click();
  }

  const emailField = dialog.getByLabel(/email/i).first();
  const passwordField = dialog.getByLabel(/password/i).first();
  await expect(emailField).toBeVisible({ timeout: 10_000 });
  await expect(passwordField).toBeVisible({ timeout: 10_000 });
  await emailField.fill(account.email);
  await passwordField.fill(account.password);
  await dialog.getByRole('button', { name: /^Embark$/i }).click();
  await waitForAuthenticatedUi(page);
};

export type LoginThroughUiOptions = {
  landingPath?: string;
};

export const loginThroughUi = async (
  page: Page,
  account: SeededAccount,
  options: LoginThroughUiOptions = {},
) => {
  const landingPath = options.landingPath?.trim()
    ? options.landingPath.trim()
    : '/bridge';
  const authLandingPath = '/bridge';

  const bridgePathPattern = /\/bridge\/?(?:[?#].*)?$/;

  try {
    const apiSession = await loginViaApi(page.request, account);
    const profileSlug = apiSession?.user?.profileSlug ?? account.slug;
    if (!profileSlug) {
      throw new Error(`Seeded login response missing profileSlug for ${account.email}`);
    }

    const sessionPayload = {
      ...apiSession,
      user: {
        ...(apiSession.user ?? {}),
        id: apiSession?.user?.id ?? 0,
        email: account.email,
        profileSlug,
        role: apiSession?.user?.role ?? null,
      },
    };

    const sessionRaw = JSON.stringify(sessionPayload);
    await page.addInitScript(
      ({ key, value }) => {
        window.localStorage.setItem(key, value);
      },
      { key: 'astralpirates-session', value: sessionRaw },
    );

    // Authenticate on a stable route first, then navigate to the requested landing path.
    try {
      await expect(async () => {
        await gotoWithRetry(page, authLandingPath);
        await waitForAuthenticatedUi(page);
      }).toPass({ timeout: 90_000 });
    } catch {
      // Some CI runs drop the API-seeded localStorage session during initial hydration.
      // Fall back to first-class UI login to restore a verified authenticated state.
      await loginThroughDialog(page, account);
      await expect(page).toHaveURL(bridgePathPattern, { timeout: 30_000 });
      await waitForAuthenticatedUi(page);
    }
  } catch {
    // API-first authentication is preferred for stability. If any auth/bootstrap
    // step fails, fall back to first-class UI login to recover state.
    await loginThroughDialog(page, account);
    await expect(page).toHaveURL(bridgePathPattern, { timeout: 30_000 });
    await waitForAuthenticatedUi(page);
  }

  if (landingPath !== authLandingPath) {
    await expect(async () => {
      await gotoWithRetry(page, landingPath);
      await waitForNuxtReady(page);
    }).toPass({ timeout: 90_000 });
  }
};

export const logoutThroughUi = async (page: Page) => {
  const logoutButton = page
    .locator('#auth-flyout button, #auth-flyout [role="button"], .auth-flyout button, .auth-flyout [role="button"]')
    .filter({ hasText: /disembark/i });
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
    await expect(page.getByRole('button', { name: 'Embark' })).toBeVisible({ timeout: 10_000 });
  }
};

export const readStoredSession = async (page: Page) =>
  page.evaluate(() => window.localStorage.getItem('astralpirates-session'));
