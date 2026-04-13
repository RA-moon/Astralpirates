import { test, expect } from '@playwright/test';
import { getSeededCaptain, getSeededCrew } from './support/fixtures';
import { loginThroughUi, waitForAuthenticatedUi } from './support/auth';
import {
  buildApiUrl,
  createFlightPlanViaApi,
  inviteCrewToPlanViaApi,
  loginViaApi,
} from './support/api';

const uniqueLabel = () => new Date().toISOString().replace(/[^0-9]/g, '');

test.describe('Flight plan invites', () => {
  test('captain invites crew and invitee accepts from profile', async ({ page, request, browser }) => {
    let captain;
    let crew;
    try {
      captain = getSeededCaptain();
      crew = getSeededCrew();
    } catch (error: any) {
      test.skip(String(error?.message ?? error));
      return;
    }

    const captainSession = await loginViaApi(request, captain);
    const captainToken = captainSession.token ?? '';
    expect(captainToken).toBeTruthy();
    const planTitle = `Playwright mission ${uniqueLabel()}`;
    const planSlug = await createFlightPlanViaApi(request, captainToken, {
      title: planTitle,
      summary: 'Automated invite flow validation.',
      location: 'Test Dock',
    });
    const membershipId = await inviteCrewToPlanViaApi(
      request,
      captainToken,
      planSlug,
      crew.slug,
    );
    expect(membershipId).toBeTruthy();

    await loginThroughUi(page, captain, { landingPath: `/flight-plans/${planSlug}` });
    await waitForAuthenticatedUi(page);
    await expect(page.getByRole('heading', { name: planTitle })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Crew roster' })).toBeVisible({ timeout: 30_000 });
    const pendingEntry = page.locator('.flight-plan__member-list').filter({ hasText: crew.slug });
    await expect(pendingEntry.first()).toBeVisible({ timeout: 30_000 });

    const crewContext = await browser.newContext({
      baseURL: process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:8080',
    });
    const crewPage = await crewContext.newPage();
    await loginThroughUi(crewPage, crew);
    await waitForAuthenticatedUi(crewPage);
    await crewPage.waitForURL(/\/bridge\/?(?:[?#].*)?$/, { timeout: 30_000 });

    const invitesSection = crewPage.locator('[data-profile-flight-invites]');
    await expect(invitesSection).toBeVisible({ timeout: 30_000 });
    const inviteRow = invitesSection.locator('.ui-status-list__item').filter({ hasText: planTitle });
    await expect(inviteRow).toBeVisible({ timeout: 30_000 });

    const acceptButton = inviteRow.getByRole('button', { name: 'Accept' });
    await acceptButton.click();
    await expect(inviteRow).not.toBeVisible({ timeout: 30_000 });

    await expect
      .poll(
        async () => {
          const rosterResponse = await request.get(
            buildApiUrl(`/api/flight-plans/${encodeURIComponent(planSlug)}/members`),
            { headers: { Authorization: `Bearer ${captainSession.token}` } },
          );
          if (!rosterResponse.ok()) return null;
          const rosterPayload = await rosterResponse.json();
          const membership = Array.isArray(rosterPayload?.memberships)
            ? rosterPayload.memberships.find(
              (member: any) =>
                (member?.user?.profileSlug ?? member?.user?.slug) === crew.slug,
            )
            : null;
          return membership?.status ?? null;
        },
        { timeout: 30_000, interval: 1_000 },
      )
      .toBe('accepted');

    await crewContext.close();
  });
});
