import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import type { Payload } from 'payload';

vi.mock('@/app/lib/payload', () => ({
  getPayloadInstance: vi.fn(),
}));

vi.mock('@/src/utils/clientFingerprint', () => ({
  resolveClientFingerprint: vi.fn(() => '203.0.113.10'),
}));

vi.mock('@/app/api/_lib/register', () => ({
  buildRegisterURL: vi.fn(() => 'https://astralpirates.com/enlist/accept?token=request-token'),
  resolveRegisterUrlOptions: vi.fn(() => ({
    origin: 'https://crew.test',
    forwardedProto: 'https',
    forwardedHost: 'astralpirates.com',
    referer: null,
  })),
}));

vi.mock('@/src/emails/auth', () => ({
  renderRequestInviteEmail: vi.fn(() => ({
    subject: 'Request invite',
    text: 'Request invite text',
    html: '<p>Request invite html</p>',
  })),
}));

vi.mock('@/app/api/invitations/transportState', () => ({
  getEmailTransportStatus: vi.fn(),
  markEmailTransportFailure: vi.fn(),
  markEmailTransportRecovered: vi.fn(),
}));

vi.mock('@/src/utils/emailTransport', () => ({
  captureTransportError: vi.fn(() => ({ code: 'EAUTH', message: 'Authentication failed' })),
  isSmtpAuthFailure: vi.fn(() => false),
}));

import { POST } from '@/app/api/auth/request-invite/route';
import { getPayloadInstance } from '@/app/lib/payload';
import {
  getEmailTransportStatus,
  markEmailTransportFailure,
  markEmailTransportRecovered,
} from '@/app/api/invitations/transportState';
import { isSmtpAuthFailure } from '@/src/utils/emailTransport';

const mockedGetPayloadInstance = vi.mocked(getPayloadInstance);
const mockedGetEmailTransportStatus = vi.mocked(getEmailTransportStatus);
const mockedMarkEmailTransportFailure = vi.mocked(markEmailTransportFailure);
const mockedMarkEmailTransportRecovered = vi.mocked(markEmailTransportRecovered);
const mockedIsSmtpAuthFailure = vi.mocked(isSmtpAuthFailure);

const makeRequest = (body: Record<string, unknown>) =>
  ({
    method: 'POST',
    headers: new Headers({
      origin: 'https://crew.test',
      'x-forwarded-proto': 'https',
      'x-forwarded-host': 'astralpirates.com',
      'content-type': 'application/json',
      'user-agent': 'vitest',
    }),
    json: async () => body,
  }) as unknown as NextRequest;

const createPayload = () => {
  const payload = {
    find: vi.fn(),
    create: vi.fn(),
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

describe('/api/auth/request-invite route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetEmailTransportStatus.mockResolvedValue({
      offline: false,
      retryAt: null,
      lastError: null,
    });
    mockedIsSmtpAuthFailure.mockReturnValue(false);
  });

  it('returns 429 when IP daily request limit is exceeded', async () => {
    const payload = createPayload();
    payload.find.mockResolvedValue({ docs: [{ id: 1 }], totalDocs: 3 });
    mockedGetPayloadInstance.mockResolvedValue(payload);

    const response = await POST(
      makeRequest({
        email: 'rate-limited@example.com',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(body.error).toMatch(/too many invite requests/i);
    expect(payload.create).not.toHaveBeenCalled();
    expect(payload.sendEmail).not.toHaveBeenCalled();
  });

  it('rolls back created token and marks transport failure on SMTP auth errors', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: { collection: string; where?: unknown }) => {
      if (args.collection === 'invite-requests') {
        return { docs: [], totalDocs: 0 };
      }
      if (args.collection === 'users') {
        const whereJson = JSON.stringify(args.where ?? {});
        if (whereJson.includes('"email"')) {
          return { docs: [], totalDocs: 0 };
        }
        return { docs: [{ id: 900, role: 'captain' }], totalDocs: 1 };
      }
      if (args.collection === 'registration-tokens') {
        return { docs: [], totalDocs: 0 };
      }
      return { docs: [], totalDocs: 0 };
    });
    payload.create.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === 'registration-tokens') {
        return { id: 555 };
      }
      return { id: 777 };
    });
    payload.sendEmail.mockRejectedValue(new Error('535 Authentication failed'));
    mockedGetPayloadInstance.mockResolvedValue(payload);
    mockedIsSmtpAuthFailure.mockReturnValue(true);

    const response = await POST(
      makeRequest({
        email: 'new-crew@example.com',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/unable to process invite request/i);
    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'registration-tokens',
        id: 555,
      }),
    );
    expect(mockedMarkEmailTransportFailure).toHaveBeenCalled();
    expect(mockedMarkEmailTransportRecovered).not.toHaveBeenCalled();
  });

  it('only revokes pending recruit-purpose tokens before issuing a new invite token', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: { collection: string; where?: unknown }) => {
      if (args.collection === 'invite-requests') {
        return { docs: [], totalDocs: 0 };
      }
      if (args.collection === 'users') {
        const whereJson = JSON.stringify(args.where ?? {});
        if (whereJson.includes('"email"')) {
          return { docs: [], totalDocs: 0 };
        }
        return { docs: [{ id: 901, role: 'captain' }], totalDocs: 1 };
      }
      if (args.collection === 'registration-tokens') {
        const whereJson = JSON.stringify(args.where ?? {});
        expect(whereJson).toContain('"purpose":{"equals":"recruit"}');
        expect(whereJson).not.toContain('password_reset');
        return { docs: [{ id: 111 }], totalDocs: 1 };
      }
      return { docs: [], totalDocs: 0 };
    });
    payload.create.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === 'registration-tokens') {
        return { id: 777 };
      }
      return { id: 888 };
    });
    mockedGetPayloadInstance.mockResolvedValue(payload);

    const response = await POST(
      makeRequest({
        email: 'fresh@example.com',
      }),
    );

    expect(response.status).toBe(200);
    expect(payload.delete).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'registration-tokens',
        id: 111,
      }),
    );

    const registrationTokenCreateCall = payload.create.mock.calls
      .map(([arg]) => arg)
      .find((arg: { collection?: string }) => arg?.collection === 'registration-tokens') as
      | { data?: Record<string, unknown> }
      | undefined;
    expect(registrationTokenCreateCall?.data?.inviter).toBe(901);
  });

  it('keeps generic response semantics for existing and non-existing users', async () => {
    const existingPayload = createPayload();
    existingPayload.find.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === 'invite-requests') {
        return { docs: [], totalDocs: 0 };
      }
      if (args.collection === 'users') {
        return { docs: [{ id: 10 }], totalDocs: 1 };
      }
      return { docs: [], totalDocs: 0 };
    });
    mockedGetPayloadInstance.mockResolvedValueOnce(existingPayload);

    const existingResponse = await POST(
      makeRequest({
        email: 'existing@example.com',
      }),
    );
    const existingBody = await existingResponse.json();

    const newUserPayload = createPayload();
    newUserPayload.find.mockImplementation(async (args: { collection: string; where?: unknown }) => {
      if (args.collection === 'invite-requests') {
        return { docs: [], totalDocs: 0 };
      }
      if (args.collection === 'users') {
        const whereJson = JSON.stringify(args.where ?? {});
        if (whereJson.includes('"email"')) {
          return { docs: [], totalDocs: 0 };
        }
        return { docs: [{ id: 902, role: 'captain' }], totalDocs: 1 };
      }
      if (args.collection === 'registration-tokens') {
        return { docs: [], totalDocs: 0 };
      }
      return { docs: [], totalDocs: 0 };
    });
    newUserPayload.create.mockImplementation(async (args: { collection: string }) => {
      if (args.collection === 'registration-tokens') {
        return { id: 321 };
      }
      return { id: 654 };
    });
    mockedGetPayloadInstance.mockResolvedValueOnce(newUserPayload);

    const newUserResponse = await POST(
      makeRequest({
        email: 'new@example.com',
      }),
    );
    const newUserBody = await newUserResponse.json();

    expect(existingResponse.status).toBe(200);
    expect(newUserResponse.status).toBe(200);
    expect(existingBody).toEqual(newUserBody);
    expect(existingBody).toEqual({
      message: 'If the address is registered, instructions have been sent.',
    });
  });

  it('returns 503 when no captain inviter can be resolved', async () => {
    const payload = createPayload();
    payload.find.mockImplementation(async (args: { collection: string; where?: unknown }) => {
      if (args.collection === 'invite-requests') {
        return { docs: [], totalDocs: 0 };
      }
      if (args.collection === 'users') {
        const whereJson = JSON.stringify(args.where ?? {});
        if (whereJson.includes('"email"')) {
          return { docs: [], totalDocs: 0 };
        }
        return { docs: [], totalDocs: 0 };
      }
      if (args.collection === 'registration-tokens') {
        return { docs: [], totalDocs: 0 };
      }
      return { docs: [], totalDocs: 0 };
    });
    mockedGetPayloadInstance.mockResolvedValue(payload);

    const response = await POST(
      makeRequest({
        email: 'no-captain@example.com',
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toMatch(/temporarily unavailable/i);
    expect(payload.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'registration-tokens' }),
    );
  });
});
