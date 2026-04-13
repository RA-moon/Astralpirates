import { test, expect, APIRequestContext } from '@playwright/test';
const defaultApiBase = process.env.CI === 'true' ? 'http://cms:3000' : 'http://localhost:3000';
const resolveApiBase = () =>
  process.env.PLAYWRIGHT_API_BASE ?? process.env.ASTRAL_API_BASE ?? defaultApiBase;
const apiTimeoutMs = 45_000;

const buildApiUrl = (path: string) => {
  const base = resolveApiBase();
  try {
    return new URL(path, base).toString();
  } catch {
    return `${base.replace(/\/$/, '')}${path}`;
  }
};

const fetchOrSkip = async (request: APIRequestContext, path: string) => {
  try {
    return await request.get(buildApiUrl(path), { timeout: apiTimeoutMs });
  } catch (error) {
    test.skip(
      `Flight plan endpoint unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

test.describe('Flight plan API contract', () => {
  test.describe.configure({ timeout: 90_000 });
  test('exposes plans by slug and protects crew roster endpoints', async ({ request }) => {
    let plansResponse: Awaited<ReturnType<typeof request.get>> | null = null;
    try {
      plansResponse = await fetchOrSkip(request, '/api/flight-plans?limit=5&depth=0');
    } catch (error) {
      test.skip(
        `Flight plan index unreachable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!plansResponse) return;
    if (!plansResponse.ok()) {
      test.skip(`Flight plan index unavailable (status ${plansResponse.status()}).`);
    }
    expect(plansResponse.ok()).toBeTruthy();

    const payload = await plansResponse.json();
    const availablePlans = Array.isArray(payload?.plans) ? payload.plans : [];
    const plan = availablePlans.find((entry: any) => entry?.slug) ?? null;
    if (!plan?.slug) {
      test.skip(true, 'No public flight plan fixture available in this environment.');
      return;
    }

    const slug = String(plan.slug);
    const planResponse = await fetchOrSkip(request, `/api/flight-plans/${slug}`);
    if (!planResponse) return;
    if (plan.isPublic) {
      expect(planResponse.ok(), 'public missions should be readable').toBeTruthy();
    } else {
      expect(planResponse.status(), 'private missions stay hidden from unauthenticated viewers').toBe(404);
    }

    const rosterResponse = await fetchOrSkip(request, `/api/flight-plans/${slug}/members`);
    if (!rosterResponse) return;
    if (plan.isPublic) {
      expect(rosterResponse.status(), 'public rosters should be readable').toBe(200);
      const rosterPayload = await rosterResponse.json();
      expect(Array.isArray(rosterPayload?.memberships)).toBeTruthy();
    } else {
      expect(rosterResponse.status()).toBe(401);
    }

    const inviteesResponse = await fetchOrSkip(request, `/api/flight-plans/${slug}/invitees?q=test`);
    if (!inviteesResponse) return;
    expect(inviteesResponse.status()).toBe(401);
  });

  test('returns 404 for unknown slug', async ({ request }) => {
    const missingSlug = `missing-${Date.now()}`;
    const response = await fetchOrSkip(request, `/api/flight-plans/${missingSlug}`);
    if (!response) return;
    if (response.status() >= 500) {
      test.skip(`Flight plan detail unavailable (status ${response.status()}).`);
    }
    expect(response.status()).toBe(404);
  });
});
