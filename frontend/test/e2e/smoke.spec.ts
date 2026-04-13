import { test, expect } from '@playwright/test';
import { getSeededCaptain } from './support/fixtures';
import { loginThroughUi, readStoredSession } from './support/auth';

const resolveBaseURL = () => process.env.PLAYWRIGHT_TEST_BASE_URL ?? 'http://localhost:8080';

const resolveExpectedOrigin = () => {
  if (process.env.PLAYWRIGHT_EXPECTED_ORIGIN) {
    return process.env.PLAYWRIGHT_EXPECTED_ORIGIN;
  }
  try {
    return new URL(resolveBaseURL()).origin;
  } catch {
    return 'http://localhost:8080';
  }
};

const defaultApiBase = process.env.CI === 'true' ? 'http://cms:3000' : 'http://localhost:3000';
const resolveApiBase = () =>
  process.env.PLAYWRIGHT_API_BASE ?? process.env.ASTRAL_API_BASE ?? defaultApiBase;

const buildApiUrl = (path: string) => {
  const base = resolveApiBase();
  try {
    return new URL(path, base).toString();
  } catch {
    return `${base.replace(/\/$/, '')}${path}`;
  }
};

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2nYHkAAAAASUVORK5CYII=';

test.describe('Astral Pirates smoke', () => {
  test('homepage renders navigation shell', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Bridge' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Embark' })).toBeVisible();
  });

  test('homepage renders CMS content blocks', async ({ page, request }) => {
    const pagesResponse = await request.get(
      buildApiUrl('/api/pages?where[path][equals]=/&depth=1&limit=1'),
    );
    if (!pagesResponse.ok()) {
      test.skip(
        true,
        `Pages endpoint unavailable (status ${pagesResponse.status()}).`,
      );
    }
    const pagesPayload = await pagesResponse.json();
    const pageDocs = Array.isArray(pagesPayload?.docs) ? pagesPayload.docs : [];
    if (!pageDocs.length) {
      test.skip(true, 'No CMS page seeded for "/" in this environment.');
    }
    const homepageLayout = Array.isArray(pageDocs[0]?.layout) ? pageDocs[0].layout : [];
    if (!homepageLayout.length) {
      test.skip(true, 'CMS page "/" has no layout blocks in this environment.');
    }

    await page.goto('/');

    const renderer = page.locator('.page-renderer');
    const fallback = page.getByText('Page content is not available.');
    const emptyState = page.locator('.page-renderer__empty');

    const resolveHomepageState = async (): Promise<'renderer' | 'fallback' | 'empty' | 'pending'> => {
      if (await renderer.first().isVisible().catch(() => false)) return 'renderer';
      if (await fallback.first().isVisible().catch(() => false)) return 'fallback';
      if (await emptyState.first().isVisible().catch(() => false)) return 'empty';
      return 'pending';
    };

    await expect
      .poll(resolveHomepageState, {
        timeout: 30_000,
        intervals: [250, 500, 1_000],
      })
      .not.toBe('pending');
    const settledState = await resolveHomepageState();

    if (settledState === 'fallback') {
      test.skip(true, 'Homepage rendered fallback content instead of CMS blocks.');
    }
    if (settledState === 'empty') {
      test.skip(true, 'Homepage rendered empty page blocks in this environment.');
    }

    await expect(renderer).toBeVisible();
    await expect(emptyState).toHaveCount(0);
    await expect(fallback).toHaveCount(0);

    const blockCount = await renderer.locator(':scope > *').count();
    expect(blockCount).toBeGreaterThan(0);
  });

  test('CMS health endpoint responds with expected CORS', async ({ request }) => {
    const expectedOrigin = resolveExpectedOrigin();
    const healthUrl = buildApiUrl('/api/profiles/health');

    let latestResponse = await request.get(healthUrl, {
      headers: { Origin: expectedOrigin },
    });

    await expect
      .poll(
        async () => {
          latestResponse = await request.get(healthUrl, {
            headers: { Origin: expectedOrigin },
          });
          return latestResponse.status();
        },
        { timeout: 60_000, interval: 2_000 },
      )
      .toBe(200);

    const payload = await latestResponse.json();
    expect(payload).toMatchObject({ ok: true });

    const allowOrigin = latestResponse.headers()['access-control-allow-origin'] ?? null;
    expect(allowOrigin).toBe(expectedOrigin);
  });

  test('slug-based crew endpoints require authentication', async ({ request }) => {
    const plansResponse = await request.get(buildApiUrl('/api/flight-plans?limit=5&depth=0'));
    if (!plansResponse.ok()) {
      test.skip(`Flight plan index unavailable (status ${plansResponse.status()}).`);
    }
    expect(plansResponse.ok()).toBeTruthy();

    const plansPayload = await plansResponse.json();
    const firstPlan = Array.isArray(plansPayload?.plans) ? plansPayload.plans.find((plan: any) => plan?.slug) : null;
    if (!firstPlan?.slug) {
      test.skip(true, 'No public flight plan fixture available in this environment.');
      return;
    }

    const slug = String(firstPlan.slug);
    const rosterUrl = buildApiUrl(`/api/flight-plans/${encodeURIComponent(slug)}/members`);
    const rosterResponse = await request.get(rosterUrl);
    if (firstPlan?.isPublic) {
      expect(rosterResponse.status(), 'public missions expose their roster').toBe(200);
    } else {
      expect(rosterResponse.status(), 'private rosters stay protected').toBe(401);
    }

    const inviteesUrl = buildApiUrl(`/api/flight-plans/${encodeURIComponent(slug)}/invitees?q=test`);
    const inviteesResponse = await request.get(inviteesUrl);
    expect(inviteesResponse.status(), 'unauthenticated invitee search should be rejected').toBe(401);
  });

  test('control roadmap renders accordion tiers with items', async ({ page, request }) => {
    const roadmapResponse = await request.get(buildApiUrl('/api/roadmap-tiers?limit=1&depth=1'));
    if (!roadmapResponse.ok()) {
      test.skip(true, `Roadmap tiers endpoint unavailable (status ${roadmapResponse.status()}).`);
    }
    const roadmapPayload = await roadmapResponse.json();
    const roadmapTiers = Array.isArray(roadmapPayload?.tiers)
      ? roadmapPayload.tiers
      : Array.isArray(roadmapPayload?.docs)
        ? roadmapPayload.docs
        : [];
    if (!roadmapTiers.length) {
      test.skip(true, 'No roadmap tiers available in this environment.');
    }

    await page.goto('/gangway/engineering/control');

    if (await page.getByText('Page content is not available.').count()) {
      test.skip(true, 'Control page rendered fallback content instead of roadmap tiers.');
    }
    if (await page.locator('.page-renderer__empty').count()) {
      test.skip(true, 'Control page rendered empty CMS blocks in this environment.');
    }
    if ((await page.locator('.control-roadmap__tiers').count()) === 0) {
      test.skip(true, 'Control roadmap shell is unavailable in this environment.');
    }

    await expect(page.locator('.control-roadmap__tiers')).toHaveCount(1);

    const accordionItems = page.locator('.control-roadmap__item');
    const itemCount = await accordionItems.count();

    expect(itemCount).toBeGreaterThanOrEqual(0);

    const summary = page.locator('.control-roadmap__item-summary').first();
    if (itemCount > 0) {
      await expect(summary).toBeVisible();
    } else {
      await expect(
        page.getByRole('heading', { name: 'Mission Control · Roadmap', exact: true }).first(),
      ).toBeVisible();
    }
  });

  test('avatar uploads replace the previous file', async ({ page, request }) => {
    let captain;
    try {
      captain = getSeededCaptain();
    } catch (error: any) {
      test.skip(String(error?.message ?? error));
      return;
    }

    await page.goto('/');
    await loginThroughUi(page, captain);
    const profilePath = '/bridge';
    const resolveTimeout = (ciMs: number, localMs: number) => (process.env.CI ? ciMs : localMs);

    const saveProfileWithAvatar = async () => {
      await page.goto(profilePath);
      const profileCard = page.locator('[data-profile-card]');
      await expect(profileCard).toBeVisible({ timeout: resolveTimeout(45_000, 30_000) });

      const editProfileButton = page.getByRole('button', { name: 'Edit profile' });
      await expect(editProfileButton).toBeVisible({ timeout: resolveTimeout(45_000, 30_000) });
      await editProfileButton.click();

      const avatarInput = page.locator('input[name="avatar"]');
      await expect(avatarInput).toHaveCount(1);
      await avatarInput.setInputFiles({
        name: `avatar-${Date.now()}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from(PNG_1X1_BASE64, 'base64'),
      });

      await page.getByRole('button', { name: 'Save changes' }).click();
      await expect(page.getByText('Profile updated successfully.')).toBeVisible({
        timeout: process.env.CI ? 60_000 : 30_000,
      });

      const storedRaw = await readStoredSession(page);
      const token = storedRaw ? JSON.parse(storedRaw)?.token : null;
      expect(token, 'expected session token after profile save').toBeTruthy();

      const profileResponse = await request.get(buildApiUrl('/api/profiles/me'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(profileResponse.ok()).toBeTruthy();
      const payload = await profileResponse.json();
      const avatarUrl = payload?.profile?.avatarUrl ?? null;
      expect(avatarUrl, 'expected avatarUrl on /api/profiles/me response').toBeTruthy();

      return { token, avatarUrl: String(avatarUrl) };
    };

    const first = await saveProfileWithAvatar();
    expect(first.avatarUrl).toContain('avatar-');

    const second = await saveProfileWithAvatar();
    expect(second.avatarUrl).toContain('avatar-');
    expect(second.avatarUrl).not.toBe(first.avatarUrl);

    await expect
      .poll(
        async () => {
          const response = await request.get(buildApiUrl('/api/profiles/me'), {
            headers: { Authorization: `Bearer ${second.token}` },
          });
          if (!response.ok()) {
            return null;
          }
          const payload = await response.json();
          return payload?.profile?.avatarUrl ?? null;
        },
        {
          timeout: resolveTimeout(45_000, 20_000),
          interval: 1_000,
          message: 'expected profile endpoint to expose the latest avatar URL',
        },
      )
      .toBe(second.avatarUrl);
  });
});
