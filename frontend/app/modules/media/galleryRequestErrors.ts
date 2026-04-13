export const asStatusCode = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const record = error as Record<string, unknown>;
  if (typeof record.statusCode === 'number' && Number.isFinite(record.statusCode)) {
    return record.statusCode;
  }
  if (record.response && typeof record.response === 'object') {
    const response = record.response as Record<string, unknown>;
    if (typeof response.status === 'number' && Number.isFinite(response.status)) {
      return response.status;
    }
  }
  return null;
};

export const isGalleryUploadTimeoutError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const statusCode = asStatusCode(error);
  if (statusCode === 408 || statusCode === 504) return true;

  const record = error as { name?: unknown; message?: unknown };
  if (record.name === 'AbortError') return true;
  const message =
    typeof record.message === 'string' ? record.message.toLowerCase() : '';
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  );
};

export const resolveGalleryUploadTimeoutMessage = (timeoutMs: number): string => {
  const timeoutSeconds = Math.max(1, Math.round(timeoutMs / 1000));
  return `Upload timed out after ${timeoutSeconds}s. Please try again.`;
};

export const extractGalleryServerErrorMessage = (error: unknown): string => {
  if (!error || typeof error !== 'object') return '';
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return '';
  const message = (data as { error?: unknown }).error;
  return typeof message === 'string' ? message.trim() : '';
};
