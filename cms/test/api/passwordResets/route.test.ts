import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { Payload } from 'payload';

vi.mock('@/app/lib/payload', () => ({
  getPayloadInstance: vi.fn(),
}));

vi.mock('@/app/api/_lib/register', () => ({
  buildRegisterURL: vi.fn(() => 'https://astralpirates.com/enlist/accept?token=reset-token'),
  resolveRegisterUrlOptions: vi.fn(() => ({
    origin: 'https://crew.test',
    forwardedProto: 'https',
    forwardedHost: 'astralpirates.com',
    referer: null,
  })),
}));

vi.mock('@/app/api/invitations/transportState', () => ({
  getEmailTransportStatus: vi.fn(),
  markEmailTransportFailure: vi.fn(),
  markEmailTransportRecovered: vi.fn(),
}));

vi.mock('@/src/emails/auth', () => ({
  renderPasswordResetEmail: vi.fn(() => ({
    subject: 'Reset',
    text: 'Reset text',
    html: '<p>Reset html</p>',
  })),
}));

vi.mock('@/src/utils/clientFingerprint', () => ({
  resolveClientFingerprint: vi.fn(() => 'test-fingerprint'),
}));

vi.mock('@/src/utils/emailTransport', () => ({
  captureTransportError: vi.fn(() => ({ code: 'EAUTH', message: 'Authentication failed' })),
  isSmtpAuthFailure: vi.fn(() => false),
}));

vi.mock('@/app/api/password-resets/rateLimiter', () => ({
  evaluateIpRateLimit: vi.fn(),
  evaluateUserRateLimit: vi.fn(),
}));

vi.mock('@/src/services/elsaLedger', () => ({
  refundElsa: vi.fn(),
  spendElsa: vi.fn(),
}));

import { POST } from '@/app/api/password-resets/route';
import { getPayloadInstance } from '@/app/lib/payload';
import {
  getEmailTransportStatus,
  markEmailTransportFailure,
  markEmailTransportRecovered,
} from '@/app/api/invitations/transportState';
import { evaluateIpRateLimit, evaluateUserRateLimit } from '@/app/api/password-resets/rateLimiter';
import { isSmtpAuthFailure } from '@/src/utils/emailTransport';
import { refundElsa, spendElsa } from '@/src/services/elsaLedger';

const mockedGetPayloadInstance = vi.mocked(getPayloadInstance);
const mockedGetEmailTransportStatus = vi.mocked(getEmailTransportStatus);
const mockedMarkEmailTransportFailure = vi.mocked(markEmailTransportFailure);
const mockedMarkEmailTransportRecovered = vi.mocked(markEmailTransportRecovered);
const mockedEvaluateIpRateLimit = vi.mocked(evaluateIpRateLimit);
const mockedEvaluateUserRateLimit = vi.mocked(evaluateUserRateLimit);
const mockedIsSmtpAuthFailure = vi.mocked(isSmtpAuthFailure);
const mockedRefundElsa = vi.mocked(refundElsa);
const mockedSpendElsa = vi.mocked(spendElsa);

const makeRequest = (body: Record<string, unknown>) =>
  ({
    method: 'POST',
    headers: new Headers({
      origin: 'https://crew.test',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'astralpirates.com',
      'content-type': 'application/json',
    }),
    json: async () => body,
  }) as unknown as NextRequest;

const createPayload = () => {
  const payload = {
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
  } as unknown as Payload & {
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    sendEmail: ReturnType<typeof vi.fn>;
    logger: {
      info: ReturnType<typeof vi.fn>;
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
    };
  };
  return payload;
};

describe('/api/password-resets route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEmailTransportStatus.mockResolvedValue({
      offline: false,
      retryAt: null,
      lastError: null,
    });
    mockedEvaluateUserRateLimit.mockResolvedValue({
      limited: false,
      retryAtIso: '2099-01-01T00:00:00.000Z',
      remaining: 2,
    });
    mockedEvaluateIpRateLimit.mockResolvedValue({
      limited: false,
      retryAtIso: '2099-01-01T00:00:00.000Z',
      remaining: 9,
    });
    mockedRefundElsa.mockResolvedValue({
      applied: true,
      balanceAfter: 7,
      ledgerId: 33,
    } as any);
    mockedSpendElsa.mockResolvedValue({
      applied: true,
      balanceAfter: 6,
      ledgerId: 34,
    } as any);
    mockedIsSmtpAuthFailure.mockReturnValue(false);
  });

  it('returns 503 while email transport is offline', async () => {
    const payload = createPayload();
    mockedGetPayloadInstance.mockResolvedValue(payload);
    mockedGetEmailTransportStatus.mockResolvedValue({
      offline: true,
      retryAt: '2026-04-04T12:05:00.000Z',
      lastError: { code: 'EAUTH', message: 'Authentication failed' },
    });

    const response = await POST(
      makeRequest({
        callSign: 'Nova',
        email: 'nova@example.com',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/temporarily unavailable/i);
    expect(payload.find).not.toHaveBeenCalled();
  });

  it('returns generic success when target user is not found', async () => {
    const payload = createPayload();
    payload.find.mockResolvedValue({ docs: [], totalDocs: 0 });
    mockedGetPayloadInstance.mockResolvedValue(payload);

    const response = await POST(
      makeRequest({
        callSign: 'Unknown',
        email: 'unknown@example.com',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toMatch(/if the account exists/i);
  });

  it('issues reset link, reclaims recruit slot, and updates invite state', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === 'users') {
        return {
          docs: [
            {
              id: 77,
              email: 'nova@example.com',
              firstName: 'Nova',
              lastName: 'Pilot',
              callSign: 'Nova',
              invite: {
                purpose: 'recruit',
                email: 'rookie@example.com',
                tokenId: '888',
                token: 'old-invite-token',
                redeemedAt: null,
              },
            },
          ],
          totalDocs: 1,
        };
      }
      if (args.collection === 'registration-tokens') {
        const whereJson = JSON.stringify((args as { where?: unknown }).where ?? {});
        if (whereJson.includes('old-invite-token') || whereJson.includes('"id":{"equals":888}')) {
          return { docs: [{ id: 888 }], totalDocs: 1 };
        }
        return { docs: [], totalDocs: 0 };
      }
      return { docs: [], totalDocs: 0 };
    });
    payload.create.mockResolvedValue({ id: 321 });
    mockedGetPayloadInstance.mockResolvedValue(payload);

    const response = await POST(
      makeRequest({
        callSign: 'Nova',
        email: 'nova@example.com',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe('Reset link sent.');
    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'registration-tokens',
        id: 888,
      }),
    );
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'registration-tokens',
        data: expect.objectContaining({
          purpose: 'password_reset',
          targetUser: 77,
        }),
      }),
    );
    expect(mockedRefundElsa).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1,
        type: 'refund',
        metadata: expect.objectContaining({
          reason: 'password_reset_refund',
          targetUser: 77,
        }),
      }),
    );
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 77,
        data: expect.objectContaining({
          invite: expect.objectContaining({
            purpose: 'password_reset',
            targetUser: 77,
            email: 'nova@example.com',
          }),
          elsaTokens: 7,
        }),
      }),
    );
    expect(mockedMarkEmailTransportRecovered).toHaveBeenCalled();
  });

  it('rolls back token and marks transport failure on SMTP auth errors', async () => {
    const payload = createPayload();
    payload.find.mockResolvedValue({
      docs: [
        {
          id: 77,
          email: 'nova@example.com',
          firstName: 'Nova',
          lastName: 'Pilot',
          callSign: 'Nova',
          invite: {},
        },
      ],
      totalDocs: 1,
    });
    payload.create.mockResolvedValue({ id: 654 });
    payload.sendEmail.mockRejectedValue(new Error('535 Authentication failed'));
    mockedGetPayloadInstance.mockResolvedValue(payload);
    mockedIsSmtpAuthFailure.mockReturnValue(true);

    const response = await POST(
      makeRequest({
        callSign: 'Nova',
        email: 'nova@example.com',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/unable to issue/i);
    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'registration-tokens',
        id: 654,
      }),
    );
    expect(mockedMarkEmailTransportFailure).toHaveBeenCalled();
  });

  it('does not revoke an existing recruit invite token when reset issuance fails early', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === 'users') {
        return {
          docs: [
            {
              id: 77,
              email: 'nova@example.com',
              firstName: 'Nova',
              lastName: 'Pilot',
              callSign: 'Nova',
              invite: {
                purpose: 'recruit',
                email: 'rookie@example.com',
                tokenId: '888',
                token: 'old-invite-token',
                redeemedAt: null,
              },
            },
          ],
          totalDocs: 1,
        };
      }
      if (args.collection === 'registration-tokens') {
        return { docs: [], totalDocs: 0 };
      }
      return { docs: [], totalDocs: 0 };
    });
    payload.create.mockResolvedValue({ id: 654 });
    payload.sendEmail.mockRejectedValue(new Error('smtp outage'));
    mockedGetPayloadInstance.mockResolvedValue(payload);

    const response = await POST(
      makeRequest({
        callSign: 'Nova',
        email: 'nova@example.com',
      }),
    );

    expect(response.status).toBe(500);
    expect(mockedRefundElsa).not.toHaveBeenCalled();
    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'registration-tokens',
        id: 654,
      }),
    );
    expect(
      payload.delete.mock.calls.some(
        ([args]) => typeof args === 'object' && (args as any)?.id === 888,
      ),
    ).toBe(false);
  });
});
