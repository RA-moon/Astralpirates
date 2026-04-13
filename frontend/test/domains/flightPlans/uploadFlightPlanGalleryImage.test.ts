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

let uploadFlightPlanGalleryImage: typeof import('~/domains/flightPlans/api').uploadFlightPlanGalleryImage;

describe('uploadFlightPlanGalleryImage', () => {
  beforeAll(async () => {
    ({ uploadFlightPlanGalleryImage } = await import('~/domains/flightPlans/api'));
  });

  beforeEach(() => {
    requestFetchMock.mockReset();
    clearSessionMock.mockReset();
    refreshSessionMock.mockReset();
    sessionMock.bearerToken = 'stale-token';
    window.localStorage.removeItem('astralpirates-session');
  });

  it('posts multipart upload payload with auth headers', async () => {
    requestFetchMock.mockResolvedValue({
      upload: {
        asset: { id: 24, url: 'https://artifact.astralpirates.com/gallery/mission.jpg' },
        imageUrl: 'https://artifact.astralpirates.com/gallery/mission.jpg',
      },
    });

    const file = new File(['abc'], 'mission.jpg', { type: 'image/jpeg' });
    const upload = await uploadFlightPlanGalleryImage({
      auth: 'test-token',
      flightPlanId: 7,
      file,
    });

    expect(upload?.asset?.id).toBe(24);
    expect(requestFetchMock).toHaveBeenCalledTimes(1);
    const [path, options] = requestFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/flight-plans/gallery-images');
    expect(options?.method).toBe('POST');
    expect(options?.timeout).toBe(45_000);
    expect(new Headers(options?.headers as HeadersInit).get('Authorization')).toBe(
      'Bearer test-token',
    );
    expect(options?.body).toBeInstanceOf(FormData);
    expect((options?.body as FormData).get('flightPlanId')).toBe('7');
    expect((options?.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('accepts top-level upload payloads for backward compatibility', async () => {
    requestFetchMock.mockResolvedValue({
      asset: { id: 29, url: 'https://artifact.astralpirates.com/gallery/top-level.jpg' },
      imageUrl: 'https://artifact.astralpirates.com/gallery/top-level.jpg',
    });

    const file = new File(['abc'], 'top-level.jpg', { type: 'image/jpeg' });
    const upload = await uploadFlightPlanGalleryImage({
      auth: 'test-token',
      flightPlanId: 7,
      file,
    });

    expect(upload.asset.id).toBe(29);
    expect(upload.imageUrl).toBe('https://artifact.astralpirates.com/gallery/top-level.jpg');
  });

  it('refreshes session and retries once on unauthorized response', async () => {
    requestFetchMock
      .mockRejectedValueOnce({ statusCode: 401 })
      .mockResolvedValueOnce({
        upload: {
          asset: { id: 33, url: 'https://artifact.astralpirates.com/gallery/retry.jpg' },
          imageUrl: 'https://artifact.astralpirates.com/gallery/retry.jpg',
        },
      });
    refreshSessionMock.mockImplementation(async () => {
      sessionMock.bearerToken = 'fresh-token';
      return { token: 'fresh-token' };
    });

    const file = new File(['abc'], 'retry.jpg', { type: 'image/jpeg' });
    const upload = await uploadFlightPlanGalleryImage({
      auth: 'stale-token',
      flightPlanId: 7,
      file,
    });

    expect(upload?.asset?.id).toBe(33);
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).toHaveBeenCalledTimes(2);
    expect(new Headers(requestFetchMock.mock.calls[1]?.[1]?.headers as HeadersInit).get('Authorization')).toBe(
      'Bearer fresh-token',
    );
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it('refreshes before upload when no auth token is available', async () => {
    sessionMock.bearerToken = null;
    refreshSessionMock.mockImplementation(async () => {
      sessionMock.bearerToken = 'fresh-token';
      return { token: 'fresh-token' };
    });
    requestFetchMock.mockResolvedValue({
      upload: {
        asset: { id: 41, url: 'https://artifact.astralpirates.com/gallery/preflight.jpg' },
        imageUrl: 'https://artifact.astralpirates.com/gallery/preflight.jpg',
      },
    });

    const file = new File(['abc'], 'preflight.jpg', { type: 'image/jpeg' });
    const upload = await uploadFlightPlanGalleryImage({
      auth: null,
      flightPlanId: 7,
      file,
    });

    expect(upload?.asset?.id).toBe(41);
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).toHaveBeenCalledTimes(1);
    expect(new Headers(requestFetchMock.mock.calls[0]?.[1]?.headers as HeadersInit).get('Authorization')).toBe(
      'Bearer fresh-token',
    );
  });

  it('fails fast when no upload token can be resolved', async () => {
    sessionMock.bearerToken = null;
    refreshSessionMock.mockResolvedValue(null);

    const file = new File(['abc'], 'missing-token.jpg', { type: 'image/jpeg' });
    await expect(
      uploadFlightPlanGalleryImage({
        auth: null,
        flightPlanId: 7,
        file,
      }),
    ).rejects.toThrow('Session expired. Sign in again.');

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).not.toHaveBeenCalled();
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  it('clears session when refresh cannot recover unauthorized response', async () => {
    requestFetchMock.mockRejectedValue({ statusCode: 401 });
    refreshSessionMock.mockResolvedValue(null);

    const file = new File(['abc'], 'mission.jpg', { type: 'image/jpeg' });
    await expect(
      uploadFlightPlanGalleryImage({
        auth: 'stale-token',
        flightPlanId: 7,
        file,
      }),
    ).rejects.toThrow('Session expired. Sign in again.');

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  it('returns a timeout message when upload request aborts', async () => {
    requestFetchMock.mockRejectedValue({
      name: 'AbortError',
      message: 'The operation was aborted.',
    });

    const file = new File(['abc'], 'mission.jpg', { type: 'image/jpeg' });
    await expect(
      uploadFlightPlanGalleryImage({
        auth: 'test-token',
        flightPlanId: 7,
        file,
      }),
    ).rejects.toThrow('Upload timed out after 45s. Please try again.');
  });
});
