import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const requestFetchMock = vi.fn();
const clearSessionMock = vi.fn();
const refreshSessionMock = vi.fn();
const sessionMock = {
  bearerToken: 'stale-token',
  clearSession: clearSessionMock,
  refresh: refreshSessionMock,
};

vi.mock('~/modules/api', () => ({
  getRequestFetch: () => requestFetchMock,
}));

vi.mock('~/stores/session', () => ({
  useSessionStore: () => sessionMock,
}));

let deleteFlightPlanGalleryImage: typeof import('~/domains/flightPlans/api').deleteFlightPlanGalleryImage;

describe('deleteFlightPlanGalleryImage', () => {
  beforeAll(async () => {
    ({ deleteFlightPlanGalleryImage } = await import('~/domains/flightPlans/api'));
  });

  beforeEach(() => {
    requestFetchMock.mockReset();
    clearSessionMock.mockReset();
    refreshSessionMock.mockReset();
    sessionMock.bearerToken = 'stale-token';
    window.localStorage.removeItem('astralpirates-session');
  });

  it('sends delete request with auth header', async () => {
    requestFetchMock.mockResolvedValue(undefined);

    await deleteFlightPlanGalleryImage({
      auth: 'test-token',
      imageId: 17,
    });

    expect(requestFetchMock).toHaveBeenCalledTimes(1);
    const [path, options] = requestFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/flight-plans/gallery-images/17');
    expect(options?.method).toBe('DELETE');
    expect(new Headers(options?.headers as HeadersInit).get('Authorization')).toBe(
      'Bearer test-token',
    );
  });

  it('appends force query when force mode is requested', async () => {
    requestFetchMock.mockResolvedValue(undefined);

    await deleteFlightPlanGalleryImage({
      auth: 'test-token',
      imageId: 17,
      force: true,
    });

    expect(requestFetchMock).toHaveBeenCalledTimes(1);
    const [path] = requestFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/flight-plans/gallery-images/17?force=true');
  });

  it('refreshes session and retries once on unauthorized response', async () => {
    requestFetchMock
      .mockRejectedValueOnce({ statusCode: 401 })
      .mockResolvedValueOnce(undefined);
    refreshSessionMock.mockImplementation(async () => {
      sessionMock.bearerToken = 'fresh-token';
      return { token: 'fresh-token' };
    });

    await deleteFlightPlanGalleryImage({
      auth: 'stale-token',
      imageId: 33,
    });

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(requestFetchMock.mock.calls[1]?.[1]?.headers as HeadersInit).get('Authorization')).toBe(
      'Bearer fresh-token',
    );
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it('treats 404 deletes as already removed', async () => {
    requestFetchMock.mockRejectedValue({ statusCode: 404 });

    await expect(
      deleteFlightPlanGalleryImage({
        auth: 'test-token',
        imageId: 17,
      }),
    ).resolves.toBeUndefined();

    expect(requestFetchMock).toHaveBeenCalledTimes(1);
    expect(refreshSessionMock).not.toHaveBeenCalled();
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it('refreshes before delete when no auth token is available', async () => {
    sessionMock.bearerToken = null;
    refreshSessionMock.mockImplementation(async () => {
      sessionMock.bearerToken = 'fresh-token';
      return { token: 'fresh-token' };
    });
    requestFetchMock.mockResolvedValue(undefined);

    await deleteFlightPlanGalleryImage({
      auth: null,
      imageId: 33,
    });

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(requestFetchMock.mock.calls[0]?.[1]?.headers as HeadersInit).get('Authorization')).toBe(
      'Bearer fresh-token',
    );
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it('clears session when refresh cannot recover unauthorized response', async () => {
    requestFetchMock.mockRejectedValue({ statusCode: 401 });
    refreshSessionMock.mockResolvedValue(null);

    await expect(
      deleteFlightPlanGalleryImage({
        auth: 'stale-token',
        imageId: 42,
      }),
    ).rejects.toThrow('Session expired. Sign in again.');

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast when no delete token can be resolved', async () => {
    sessionMock.bearerToken = null;
    refreshSessionMock.mockResolvedValue(null);

    await expect(
      deleteFlightPlanGalleryImage({
        auth: null,
        imageId: 42,
      }),
    ).rejects.toThrow('Session expired. Sign in again.');

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).not.toHaveBeenCalled();
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });
});
