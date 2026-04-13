import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
  buildRequestForUser: vi.fn(async () => ({ id: 'local-req' })),
}));

vi.mock('@/app/api/invitations/rateLimiter.ts', () => ({
  INVITE_RATE_LIMIT_MAX: 3,
  INVITE_RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,
  evaluateInviteRateLimit: vi.fn(),
}));

vi.mock('@/app/api/invitations/transportState.ts', () => ({
  getEmailTransportStatus: vi.fn(),
  markEmailTransportFailure: vi.fn(),
  markEmailTransportRecovered: vi.fn(),
}));

vi.mock('@/app/api/_lib/register', () => ({
  buildRegisterURL: vi.fn(() => 'https://astralpirates.com/enlist/accept?token=test-token'),
  resolveRegisterUrlOptions: vi.fn(() => ({
    origin: 'https://crew.test',
    forwardedProto: 'https',
    forwardedHost: 'astralpirates.com',
    referer: null,
  })),
}));

vi.mock('@/src/emails/auth', () => ({
  renderRecruitInviteEmail: vi.fn(() => ({
    subject: 'Invite',
    text: 'Invite text',
    html: '<p>Invite html</p>',
  })),
}));

vi.mock('@/src/utils/clientFingerprint', () => ({
  resolveClientFingerprint: vi.fn(() => 'test-fingerprint'),
}));

vi.mock('@/src/utils/emailTransport', () => ({
  captureTransportError: vi.fn(() => ({ code: 'EAUTH', message: 'Authentication failed' })),
  isSmtpAuthFailure: vi.fn(() => false),
}));

vi.mock('@/src/services/elsaLedger', () => ({
  refundElsa: vi.fn(),
  spendElsa: vi.fn(),
}));

import { GET, POST } from '@/app/api/invitations/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import { evaluateInviteRateLimit } from '@/app/api/invitations/rateLimiter.ts';
import {
  getEmailTransportStatus,
  markEmailTransportFailure,
  markEmailTransportRecovered,
} from '@/app/api/invitations/transportState.ts';
import { isSmtpAuthFailure } from '@/src/utils/emailTransport';
import { refundElsa, spendElsa } from '@/src/services/elsaLedger';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedEvaluateInviteRateLimit = vi.mocked(evaluateInviteRateLimit);
const mockedGetEmailTransportStatus = vi.mocked(getEmailTransportStatus);
const mockedMarkEmailTransportFailure = vi.mocked(markEmailTransportFailure);
const mockedMarkEmailTransportRecovered = vi.mocked(markEmailTransportRecovered);
const mockedIsSmtpAuthFailure = vi.mocked(isSmtpAuthFailure);
const mockedRefundElsa = vi.mocked(refundElsa);
const mockedSpendElsa = vi.mocked(spendElsa);

const makeRequest = (body?: Record<string, unknown>) =>
  ({
    method: body ? 'POST' : 'GET',
    headers: new Headers({
      origin: 'https://crew.test',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'astralpirates.com',
      'content-type': 'application/json',
    }),
    json: async () => body,
  }) as unknown as NextRequest;

const createPayload = () => ({
  find: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  sendEmail: vi.fn(),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
});

describe('/api/invitations route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEmailTransportStatus.mockResolvedValue({
      offline: false,
      retryAt: null,
      lastError: null,
    });
    mockedEvaluateInviteRateLimit.mockResolvedValue({
      limited: false,
      retryAtIso: '2099-01-01T00:00:00.000Z',
      remaining: 2,
    });
    mockedSpendElsa.mockResolvedValue({
      applied: true,
      balanceAfter: 2,
      ledgerId: 1,
    } as any);
    mockedRefundElsa.mockResolvedValue({
      applied: true,
      balanceAfter: 3,
      ledgerId: 2,
    } as any);
    mockedIsSmtpAuthFailure.mockReturnValue(false);
  });

  it('returns invite status for authenticated users', async () => {
    const payload = createPayload();
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: {
        id: 7,
        email: 'captain@astralpirates.com',
        elsaTokens: 4,
        invite: {
          purpose: 'recruit',
          firstName: 'Nova',
          lastName: 'Pilot',
          email: 'nova@example.com',
          sentAt: '2026-04-04T12:00:00.000Z',
          expiresAt: '2026-04-06T12:00:00.000Z',
          redeemedAt: null,
          linkHidden: true,
        },
      },
    } as any);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.elsaTokens).toBe(4);
    expect(body.invite).toMatchObject({
      purpose: 'recruit',
      email: 'nova@example.com',
      firstName: 'Nova',
      canInvite: false,
      canResend: true,
      linkHidden: true,
    });
  });

  it('returns 503 when transport is in cooldown', async () => {
    const payload = createPayload();
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 7, email: 'captain@astralpirates.com', invite: null, elsaTokens: 3 },
    } as any);
    mockedGetEmailTransportStatus.mockResolvedValue({
      offline: true,
      retryAt: '2026-04-04T12:05:00.000Z',
      lastError: { code: 'EAUTH', message: 'Authentication failed' },
    });

    const response = await POST(
      makeRequest({
        email: 'rookie@example.com',
        firstName: 'Rookie',
        lastName: 'Sailor',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/temporarily unavailable/i);
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.sendEmail).not.toHaveBeenCalled();
  });

  it('creates a token, sends email, spends E.L.S.A., and stores invite state on success', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === 'users') {
        return { docs: [], totalDocs: 0 };
      }
      if (args.collection === 'registration-tokens') {
        return { docs: [], totalDocs: 0 };
      }
      return { docs: [], totalDocs: 0 };
    });
    payload.create.mockResolvedValue({
      id: 123,
      createdAt: '2026-04-04T12:00:00.000Z',
    });
    payload.update.mockResolvedValue({
      invite: {
        purpose: 'recruit',
        firstName: 'Rookie',
        lastName: 'Sailor',
        email: 'rookie@example.com',
        sentAt: '2026-04-04T12:00:00.000Z',
        expiresAt: '2026-04-06T12:00:00.000Z',
        redeemedAt: null,
        linkHidden: true,
      },
      elsaTokens: 2,
    });

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: {
        id: 7,
        email: 'captain@astralpirates.com',
        firstName: 'Captain',
        lastName: 'Astra',
        callSign: 'CaptainAstra',
        invite: null,
        elsaTokens: 3,
      },
    } as any);

    const response = await POST(
      makeRequest({
        email: 'rookie@example.com',
        firstName: 'Rookie',
        lastName: 'Sailor',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'registration-tokens',
        data: expect.objectContaining({
          email: 'rookie@example.com',
          purpose: 'recruit',
        }),
      }),
    );
    expect(payload.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'rookie@example.com',
      }),
    );
    expect(mockedSpendElsa).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1,
        type: 'spend',
      }),
    );
    expect(mockedMarkEmailTransportRecovered).toHaveBeenCalled();
    expect(body).toMatchObject({
      message: 'Invitation dispatched.',
      elsaTokens: 2,
      invite: {
        email: 'rookie@example.com',
        purpose: 'recruit',
      },
    });
  });

  it('rejects a second active invite for a different email', async () => {
    const payload = createPayload();
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: {
        id: 7,
        email: 'captain@astralpirates.com',
        invite: {
          purpose: 'recruit',
          email: 'existing@example.com',
          redeemedAt: null,
        },
        elsaTokens: 2,
      },
    } as any);

    const response = await POST(
      makeRequest({
        email: 'new@example.com',
        firstName: 'New',
        lastName: 'Recruit',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatch(/already invited/i);
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.sendEmail).not.toHaveBeenCalled();
  });

  it('rolls back created token and marks transport failure on SMTP auth errors', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === 'users') {
        return { docs: [], totalDocs: 0 };
      }
      if (args.collection === 'registration-tokens') {
        return { docs: [], totalDocs: 0 };
      }
      return { docs: [], totalDocs: 0 };
    });
    payload.create.mockResolvedValue({ id: 456 });
    payload.sendEmail.mockRejectedValue(new Error('535 Authentication failed'));

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: {
        id: 7,
        email: 'captain@astralpirates.com',
        firstName: 'Captain',
        lastName: 'Astra',
        callSign: 'CaptainAstra',
        invite: null,
        elsaTokens: 3,
      },
    } as any);
    mockedIsSmtpAuthFailure.mockReturnValue(true);

    const response = await POST(
      makeRequest({
        email: 'rookie@example.com',
        firstName: 'Rookie',
        lastName: 'Sailor',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/unable to send invite/i);
    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'registration-tokens',
        id: 456,
      }),
    );
    expect(mockedMarkEmailTransportFailure).toHaveBeenCalled();
    expect(mockedSpendElsa).not.toHaveBeenCalled();
  });

  it('refunds spent E.L.S.A. when persistence fails after spending', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === 'users') {
        return { docs: [], totalDocs: 0 };
      }
      if (args.collection === 'registration-tokens') {
        return { docs: [], totalDocs: 0 };
      }
      return { docs: [], totalDocs: 0 };
    });
    payload.create.mockResolvedValue({ id: 999 });
    payload.update.mockRejectedValue(new Error('database write failed'));

    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: {
        id: 7,
        email: 'captain@astralpirates.com',
        firstName: 'Captain',
        lastName: 'Astra',
        callSign: 'CaptainAstra',
        invite: null,
        elsaTokens: 3,
      },
    } as any);

    const response = await POST(
      makeRequest({
        email: 'rookie@example.com',
        firstName: 'Rookie',
        lastName: 'Sailor',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/unable to send invite/i);
    expect(mockedSpendElsa).toHaveBeenCalled();
    expect(mockedRefundElsa).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1,
        type: 'refund',
        metadata: expect.objectContaining({
          reason: 'invite_send_refund',
          tokenId: 999,
        }),
      }),
    );
  });
});
