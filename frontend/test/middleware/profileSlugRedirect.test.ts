import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestFetchMock = vi.fn();
const navigateToMock = vi.fn();

vi.mock('~/modules/api', () => ({
  getRequestFetch: () => requestFetchMock,
}));

vi.mock('#app', () => ({
  defineNuxtRouteMiddleware: (handler: any) => handler,
  navigateTo: (...args: any[]) => navigateToMock(...args),
  useRequestEvent: () => null,
}));

const loadMiddleware = async () =>
  (await import('~/middleware/profile-slug-redirect.global')).default;

describe('profile slug redirect middleware', () => {
  beforeEach(() => {
    requestFetchMock.mockReset();
    navigateToMock.mockReset();
    vi.resetModules();
  });

  it('ignores crew-quarters static routes without a slug param', async () => {
    const middleware = await loadMiddleware();

    await middleware({
      path: '/gangway/crew-quarters/enlist',
      params: {},
      query: {},
      hash: '',
    } as any);

    expect(requestFetchMock).not.toHaveBeenCalled();
    expect(navigateToMock).not.toHaveBeenCalled();
  });

  it('redirects when the profile API returns a canonical slug', async () => {
    requestFetchMock.mockResolvedValue({
      profile: { id: 42 },
      redirectTo: { profileSlug: 'Nova' },
    });
    const middleware = await loadMiddleware();

    await middleware({
      path: '/gangway/crew-quarters/old-slug',
      params: { slug: 'old-slug' },
      query: { from: 'profile' },
      hash: '#invite',
    } as any);

    expect(requestFetchMock).toHaveBeenCalledWith('/api/profiles/old-slug');
    expect(navigateToMock).toHaveBeenCalledWith(
      {
        path: '/gangway/crew-quarters/nova',
        query: { from: 'profile' },
        hash: '#invite',
      },
      { replace: true, redirectCode: 308 },
    );
  });

  it('swallows profile 404 responses so navigation can continue', async () => {
    const error = Object.assign(new Error('Profile not found'), { statusCode: 404 });
    requestFetchMock.mockRejectedValue(error);
    const middleware = await loadMiddleware();

    await expect(
      middleware({
        path: '/gangway/crew-quarters/enlist',
        params: { slug: 'enlist' },
        query: {},
        hash: '',
      } as any),
    ).resolves.toBeUndefined();

    expect(requestFetchMock).toHaveBeenCalledWith('/api/profiles/enlist');
    expect(navigateToMock).not.toHaveBeenCalled();
  });
});
