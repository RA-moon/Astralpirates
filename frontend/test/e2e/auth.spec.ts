import { test, expect } from '@playwright/test';
import { getSeededCaptain } from './support/fixtures';
import {
  hasCrossOriginApiAuthContext,
  loginThroughUi,
  readStoredSession,
  waitForAuthenticatedUi,
} from './support/auth';
import { refreshSessionViaApi } from './support/api';

test.describe('Crew authentication', () => {
  test('logs in via UI and refreshes the session token', async ({ page, request }) => {
    let captain;
    try {
      captain = getSeededCaptain();
    } catch (error: any) {
      test.skip(String(error?.message ?? error));
      return;
    }

    await page.goto('/');
    await loginThroughUi(page, captain);

    await expect(page).toHaveURL(/\/bridge\/?(?:[?#].*)?$/);
    await waitForAuthenticatedUi(page);

    const crossOriginApiContext = hasCrossOriginApiAuthContext();

    await page.goto(`/gangway/crew-quarters/${encodeURIComponent(captain.slug)}`);
    if (crossOriginApiContext) {
      await expect(page).toHaveURL(
        new RegExp(`/gangway/crew-quarters/${encodeURIComponent(captain.slug)}(?:[?#].*)?$`),
      );
      await waitForAuthenticatedUi(page);
    } else {
      await expect(page).toHaveURL(/\/bridge\/?(?:[?#].*)?$/);
    }

    if (crossOriginApiContext) {
      test
        .info()
        .annotations.push({
          type: 'warning',
          description:
            'Skipped token refresh and cross-tab persistence assertions: PLAYWRIGHT_TEST_BASE_URL and PLAYWRIGHT_API_BASE are cross-origin in docker e2e.',
        });
      return;
    }

    const storedSessionRaw = await readStoredSession(page);
    expect(storedSessionRaw, 'session should be persisted in localStorage').toBeTruthy();

    const storedSession = storedSessionRaw ? JSON.parse(storedSessionRaw) : null;
    const token = storedSession?.token ?? null;
    expect(token, 'session token should exist after login').toBeTruthy();

    const refreshed = await refreshSessionViaApi(request, token);
    expect(refreshed?.token).toBeTruthy();
    expect(refreshed?.user?.email ?? null).toBe(captain.email);

    const persistedPage = await page.context().newPage();
    try {
      await persistedPage.goto(page.url(), { waitUntil: 'domcontentloaded' });
      await waitForAuthenticatedUi(persistedPage);
    } finally {
      await persistedPage.close();
    }
  });
});
