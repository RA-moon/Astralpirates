import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const requestFetchMock = vi.fn();
const clearSessionMock = vi.fn();
const refreshSessionMock = vi.fn();
const sessionMock = {
  bearerToken: 'test-token',
  clearSession: clearSessionMock,
  refresh: refreshSessionMock,
};

vi.mock('~/modules/api/index', () => ({
  getRequestFetch: () => requestFetchMock,
}));

vi.mock('~/stores/session', () => ({
  useSessionStore: () => sessionMock,
}));

let uploadPageGalleryImage: typeof import('~/modules/api/pages').uploadPageGalleryImage;
let deletePageGalleryImage: typeof import('~/modules/api/pages').deletePageGalleryImage;
let updatePageDocument: typeof import('~/modules/api/pages').updatePageDocument;

beforeAll(async () => {
  ({ uploadPageGalleryImage, deletePageGalleryImage, updatePageDocument } = await import('~/modules/api/pages'));
});

describe('updatePageDocument', () => {
  beforeEach(() => {
    requestFetchMock.mockReset();
    clearSessionMock.mockReset();
    refreshSessionMock.mockReset();
    sessionMock.bearerToken = 'stale-token';
    window.localStorage.removeItem('astralpirates-session');
    window.sessionStorage.removeItem('astralpirates-editor-session-id');
  });

  it('refreshes session and retries once on unauthorized response', async () => {
    requestFetchMock
      .mockRejectedValueOnce({ statusCode: 401 })
      .mockResolvedValueOnce({
        doc: { id: 42, title: 'Bridge', path: '/bridge', layout: [] },
        revision: 7,
      })
      .mockResolvedValueOnce({
        doc: {
          id: 42,
          title: 'Bridge',
          path: '/bridge',
          layout: [],
        },
        revision: 8,
        etag: 'W/"doc:page:42:8"',
      });
    refreshSessionMock.mockImplementation(async () => {
      sessionMock.bearerToken = 'fresh-token';
      return { token: 'fresh-token' };
    });

    const updated = await updatePageDocument(42, {
      title: 'Bridge',
      path: '/bridge',
      layout: [],
    });

    expect(updated.id).toBe(42);
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).toHaveBeenCalledTimes(3);
    expect(requestFetchMock.mock.calls[1]?.[0]).toBe('/api/pages/42');
    expect(requestFetchMock.mock.calls[2]?.[0]).toBe('/api/pages/42');
    expect(requestFetchMock.mock.calls[2]?.[1]?.headers).toMatchObject({
      Authorization: 'Bearer fresh-token',
    });
    expect(requestFetchMock.mock.calls[2]?.[1]?.headers?.['x-idempotency-key']).toContain('page-write:');
    expect(requestFetchMock.mock.calls[2]?.[1]?.headers?.['x-editor-session-id']).toBeTruthy();
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it('treats 404 deletes as already removed', async () => {
    requestFetchMock.mockRejectedValue({ statusCode: 404 });

    await expect(deletePageGalleryImage({ imageId: 91 })).resolves.toBeUndefined();

    expect(requestFetchMock).toHaveBeenCalledTimes(1);
    expect(refreshSessionMock).not.toHaveBeenCalled();
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it('clears session when refresh cannot recover unauthorized response', async () => {
    requestFetchMock.mockRejectedValue({ statusCode: 401 });
    refreshSessionMock.mockResolvedValue(null);

    await expect(
      updatePageDocument(42, {
        title: 'Bridge',
        path: '/bridge',
        layout: [],
      }),
    ).rejects.toThrow('Session expired. Sign in again.');

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe('uploadPageGalleryImage', () => {
  beforeEach(() => {
    requestFetchMock.mockReset();
    clearSessionMock.mockReset();
    refreshSessionMock.mockReset();
    sessionMock.bearerToken = 'test-token';
    window.localStorage.removeItem('astralpirates-session');
  });

  it('posts multipart upload payload with auth headers', async () => {
    requestFetchMock.mockResolvedValue({
      upload: {
        asset: { id: 91, url: 'https://artifact.astralpirates.com/gallery/a.jpg' },
        imageUrl: 'https://artifact.astralpirates.com/gallery/a.jpg',
      },
    });

    const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' });
    const upload = await uploadPageGalleryImage({ pageId: 42, file });

    expect(upload?.asset?.id).toBe(91);
    expect(requestFetchMock).toHaveBeenCalledTimes(1);
    const [path, options] = requestFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/pages/gallery-images');
    expect(options?.method).toBe('POST');
    expect(options?.headers).toEqual({ Authorization: 'Bearer test-token' });
    expect(options?.body).toBeInstanceOf(FormData);
    expect((options?.body as FormData).get('pageId')).toBe('42');
    expect((options?.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('surfaces server errors when upload fails', async () => {
    requestFetchMock.mockRejectedValue({
      data: { error: 'Image exceeds upload limit.' },
    });

    const file = new File(['abc'], 'too-big.jpg', { type: 'image/jpeg' });
    await expect(uploadPageGalleryImage({ pageId: 42, file })).rejects.toThrow(
      'Image exceeds upload limit.',
    );
  });

  it('refreshes session and retries once on unauthorized response', async () => {
    requestFetchMock
      .mockRejectedValueOnce({
        statusCode: 401,
      })
      .mockResolvedValueOnce({
        upload: {
          asset: { id: 92, url: 'https://artifact.astralpirates.com/gallery/retry.jpg' },
          imageUrl: 'https://artifact.astralpirates.com/gallery/retry.jpg',
        },
      });
    refreshSessionMock.mockImplementation(async () => {
      sessionMock.bearerToken = 'fresh-token';
      return { token: 'fresh-token' };
    });

    const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' });
    const upload = await uploadPageGalleryImage({ pageId: 42, file });

    expect(upload?.asset?.id).toBe(92);
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).toHaveBeenCalledTimes(2);
    expect(requestFetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      Authorization: 'Bearer fresh-token',
    });
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
        asset: { id: 93, url: 'https://artifact.astralpirates.com/gallery/preflight.jpg' },
        imageUrl: 'https://artifact.astralpirates.com/gallery/preflight.jpg',
      },
    });

    const file = new File(['abc'], 'preflight.jpg', { type: 'image/jpeg' });
    const upload = await uploadPageGalleryImage({ pageId: 42, file });

    expect(upload?.asset?.id).toBe(93);
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: 'Bearer fresh-token',
    });
  });

  it('fails fast when no upload token can be resolved', async () => {
    sessionMock.bearerToken = null;
    refreshSessionMock.mockResolvedValue(null);

    const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' });
    await expect(uploadPageGalleryImage({ pageId: 42, file })).rejects.toThrow(
      'Session expired. Sign in again.',
    );

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).not.toHaveBeenCalled();
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  it('clears session when refresh cannot recover unauthorized response', async () => {
    requestFetchMock.mockRejectedValue({
      statusCode: 401,
    });
    refreshSessionMock.mockResolvedValue(null);

    const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' });
    await expect(uploadPageGalleryImage({ pageId: 42, file })).rejects.toThrow(
      'Session expired. Sign in again.',
    );
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  it('clears session when refresh throws on unauthorized response', async () => {
    requestFetchMock.mockRejectedValue({
      statusCode: 401,
    });
    refreshSessionMock.mockRejectedValue(new Error('refresh failed'));

    const file = new File(['abc'], 'a.jpg', { type: 'image/jpeg' });
    await expect(uploadPageGalleryImage({ pageId: 42, file })).rejects.toThrow(
      'Session expired. Sign in again.',
    );
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });
});

describe('deletePageGalleryImage', () => {
  beforeEach(() => {
    requestFetchMock.mockReset();
    clearSessionMock.mockReset();
    refreshSessionMock.mockReset();
    sessionMock.bearerToken = 'test-token';
    window.localStorage.removeItem('astralpirates-session');
  });

  it('deletes media with auth headers', async () => {
    requestFetchMock.mockResolvedValue(null);

    await deletePageGalleryImage({ imageId: 91 });

    expect(requestFetchMock).toHaveBeenCalledTimes(1);
    const [path, options] = requestFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/pages/gallery-images/91');
    expect(options?.method).toBe('DELETE');
    expect(options?.headers).toEqual({ Authorization: 'Bearer test-token' });
  });

  it('appends force query when force mode is requested', async () => {
    requestFetchMock.mockResolvedValue(null);

    await deletePageGalleryImage({ imageId: 91, force: true });

    expect(requestFetchMock).toHaveBeenCalledTimes(1);
    const [path] = requestFetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/pages/gallery-images/91?force=true');
  });

  it('refreshes session and retries once on unauthorized response', async () => {
    requestFetchMock
      .mockRejectedValueOnce({ statusCode: 401 })
      .mockResolvedValueOnce(null);
    refreshSessionMock.mockImplementation(async () => {
      sessionMock.bearerToken = 'fresh-token';
      return { token: 'fresh-token' };
    });

    await deletePageGalleryImage({ imageId: 91 });

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).toHaveBeenCalledTimes(2);
    expect(requestFetchMock.mock.calls[1]?.[0]).toBe('/api/pages/gallery-images/91');
    expect(requestFetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      Authorization: 'Bearer fresh-token',
    });
    expect(clearSessionMock).not.toHaveBeenCalled();
  });

  it('clears session when refresh cannot recover unauthorized response', async () => {
    requestFetchMock.mockRejectedValue({ statusCode: 401 });
    refreshSessionMock.mockResolvedValue(null);

    await expect(deletePageGalleryImage({ imageId: 91 })).rejects.toThrow(
      'Session expired. Sign in again.',
    );
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });

  it('fails fast when delete token cannot be resolved', async () => {
    sessionMock.bearerToken = null;
    refreshSessionMock.mockResolvedValue(null);

    await expect(deletePageGalleryImage({ imageId: 91 })).rejects.toThrow(
      'Session expired. Sign in again.',
    );
    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(requestFetchMock).not.toHaveBeenCalled();
    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });
});
