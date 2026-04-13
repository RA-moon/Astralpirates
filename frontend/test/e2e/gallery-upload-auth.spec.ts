import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
} from '@playwright/test';

import { buildApiUrl, loginViaApi } from './support/api';
import { getSeededCaptain, type SeededAccount } from './support/fixtures';

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2nYHkAAAAASUVORK5CYII=';

const buildFlightPlanPayload = () => ({
  title: `Upload auth regression ${new Date().toISOString()}`,
  summary: 'Regression check for stale bearer with valid cookie.',
  location: 'Automated QA Dock',
  eventDate: new Date().toISOString().slice(0, 10),
  body: [
    {
      type: 'paragraph',
      children: [{ text: 'Created by Playwright upload auth regression.' }],
    },
  ],
});

const createFlightPlan = async (apiRequest: APIRequestContext, token: string) => {
  const createResponse = await apiRequest.post(buildApiUrl('/api/flight-plans'), {
    headers: { Authorization: `Bearer ${token}` },
    data: buildFlightPlanPayload(),
  });
  expect(createResponse.status(), 'captain should create flight plan for upload test').toBe(201);

  const payload = await createResponse.json();
  const idRaw = payload?.plan?.id;
  const id = typeof idRaw === 'number' ? idRaw : Number.parseInt(String(idRaw), 10);
  const slug = typeof payload?.plan?.slug === 'string' ? payload.plan.slug : null;
  expect(Number.isFinite(id), 'created flight plan should include numeric id').toBeTruthy();
  expect(slug, 'created flight plan should include slug').toBeTruthy();

  return { id, slug: String(slug) };
};

test.describe('Gallery upload auth fallback', () => {
  test('accepts valid auth cookie even when bearer token is stale', async ({ request }) => {
    let captain: SeededAccount;
    try {
      captain = getSeededCaptain();
    } catch (error: unknown) {
      test.skip(String(error));
      return;
    }

    const captainSession = await loginViaApi(request, captain);
    const captainToken = captainSession.token ?? '';
    expect(captainToken).toBeTruthy();

    const { id: flightPlanId, slug } = await createFlightPlan(request, captainToken);

    try {
      const multipart = {
        flightPlanId: String(flightPlanId),
        file: {
          name: `gallery-auth-${Date.now()}.png`,
          mimeType: 'image/png',
          buffer: Buffer.from(PNG_1X1_BASE64, 'base64'),
        },
      };

      const unauthenticatedContext = await playwrightRequest.newContext();
      try {
        const noCookieResponse = await unauthenticatedContext.post(
          buildApiUrl('/api/flight-plans/gallery-images'),
          {
            headers: { Authorization: 'Bearer stale-token' },
            multipart,
          },
        );
        expect(noCookieResponse.status(), 'stale bearer alone should stay blocked').toBe(401);
      } finally {
        await unauthenticatedContext.dispose();
      }

      const fallbackResponse = await request.post(buildApiUrl('/api/flight-plans/gallery-images'), {
        headers: { Authorization: 'Bearer stale-token' },
        multipart,
      });
      expect(
        fallbackResponse.status(),
        'valid auth cookie should allow upload when bearer token is stale',
      ).toBe(201);

      const payload = await fallbackResponse.json();
      expect(payload?.upload?.asset?.id).toBeTruthy();
      expect(payload?.upload?.imageUrl).toBeTruthy();
    } finally {
      await request.delete(buildApiUrl(`/api/flight-plans/${encodeURIComponent(slug)}`), {
        headers: { Authorization: `Bearer ${captainToken}` },
      });
    }
  });
});
