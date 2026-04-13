export type EmailTransportSnapshot = {
  code?: string;
  response?: string;
  message?: string;
};

export const captureTransportError = (error: unknown): EmailTransportSnapshot => {
  if (!error || typeof error !== 'object') {
    return { message: typeof error === 'string' ? error : 'Unknown transport error' };
  }
  const err = error as Record<string, unknown>;
  return {
    code: typeof err.code === 'string' ? err.code : undefined,
    response: typeof err.response === 'string' ? err.response : undefined,
    message: typeof err.message === 'string' ? err.message : undefined,
  };
};

export const isSmtpAuthFailure = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const err = error as Record<string, unknown>;
  if (typeof err.code === 'string' && err.code.toUpperCase() === 'EAUTH') return true;
  if (typeof err.responseCode === 'number' && err.responseCode === 535) return true;
  const message = typeof err.message === 'string' ? err.message : '';
  if (message.toLowerCase().includes('authentication failed')) return true;
  if (message.includes('535 ')) return true;
  return false;
};
