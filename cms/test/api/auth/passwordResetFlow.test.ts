import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { Payload } from 'payload';
import type { NextRequest } from 'next/server';

import { POST } from '@/app/api/auth/register/[token]/route.ts';
import { getPayloadInstance } from '@/app/lib/payload';

vi.mock('@/app/lib/payload', () => ({
  getPayloadInstance: vi.fn(),
}));

const buildRequest = (body: Record<string, unknown>) =>
  ({
    method: 'POST',
    headers: new Headers({
      Origin: 'https://crew.test',
      'Content-Type': 'application/json',
    }),
    json: async () => body,
  }) as unknown as NextRequest;

describe('password reset registration handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the user password and logs them in when token purpose is password_reset', async () => {
    const tokenDoc = {
      id: 321,
      token: 'reset-token',
      email: 'crew@example.com',
      firstName: 'Rookie',
      lastName: 'Sailor',
      purpose: 'password_reset',
      targetUser: 99,
      expiresAt: '2099-01-01T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
      used: false,
    };

    const userDoc = {
      id: 99,
      email: 'crew@example.com',
      updatedAt: '2025-01-02T00:00:00.000Z',
      invite: {
        purpose: 'password_reset',
        email: 'crew@example.com',
        firstName: 'Rookie',
        lastName: 'Sailor',
        token: 'reset-token',
        sentAt: '2025-01-02T00:00:00.000Z',
      },
    };

    const payload: Partial<Payload> & {
      find: ReturnType<typeof vi.fn>;
      findByID: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      login: ReturnType<typeof vi.fn>;
      config: { cookiePrefix: string; serverURL: string };
      logger: { warn: ReturnType<typeof vi.fn> };
    } = {
      config: {
        cookiePrefix: 'payload',
        serverURL: 'https://cms.test',
      },
      logger: {
        warn: vi.fn(),
      },
      find: vi.fn(async () => ({
        docs: [tokenDoc],
        totalDocs: 1,
      })),
      findByID: vi.fn(async () => userDoc),
      update: vi.fn(async () => ({})),
      login: vi.fn(async () => ({
        token: 'session-token',
        user: { id: 99, email: 'crew@example.com' },
        exp: Math.floor(Date.now() / 1000) + 3600,
      })),
    };

    vi.mocked(getPayloadInstance).mockResolvedValue(payload as Payload);

    const newPassword = 'reset-test-credential';

    const response = await POST(
      buildRequest({
        email: 'crew@example.com',
        firstName: 'Rookie',
        lastName: 'Sailor',
        password: newPassword,
        confirmPassword: newPassword,
      }),
      { params: { token: 'reset-token' } },
    );

    expect(response.status).toBe(200);
    expect(payload.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ id: 99, collection: 'users' }),
    );
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 99,
        data: expect.objectContaining({
          password: newPassword,
          loginAttempts: 0,
          lockUntil: null,
        }),
      }),
    );
    expect(payload.login).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        data: { email: 'crew@example.com', password: newPassword },
      }),
    );
  });

  it('rejects password reset when profile snapshots no longer match the account', async () => {
    const tokenDoc = {
      id: 322,
      token: 'reset-token-mismatch',
      email: 'crew@example.com',
      firstName: 'Rookie',
      lastName: 'Sailor',
      purpose: 'password_reset',
      targetUser: 99,
      expiresAt: '2099-01-01T00:00:00.000Z',
      createdAt: '2025-01-01T00:00:00.000Z',
      used: false,
    };

    const userDoc = {
      id: 99,
      email: 'crew@example.com',
      callSign: 'Renamed Pilot',
      profileSlug: 'renamed-pilot',
      invite: {
        purpose: 'password_reset',
        email: 'crew@example.com',
        firstName: 'Rookie',
        lastName: 'Sailor',
        token: 'reset-token-mismatch',
        sentAt: '2025-01-02T00:00:00.000Z',
        callSignSnapshot: 'Original Pilot',
        profileSlugSnapshot: 'original-pilot',
      },
    };

    const payload: Partial<Payload> & {
      find: ReturnType<typeof vi.fn>;
      findByID: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      login: ReturnType<typeof vi.fn>;
      config: { cookiePrefix: string; serverURL: string };
      logger: { warn: ReturnType<typeof vi.fn> };
    } = {
      config: {
        cookiePrefix: 'payload',
        serverURL: 'https://cms.test',
      },
      logger: {
        warn: vi.fn(),
      },
      find: vi.fn(async () => ({
        docs: [tokenDoc],
        totalDocs: 1,
      })),
      findByID: vi.fn(async () => userDoc),
      update: vi.fn(async () => ({})),
      login: vi.fn(async () => ({
        token: 'session-token',
        user: { id: 99, email: 'crew@example.com' },
        exp: Math.floor(Date.now() / 1000) + 3600,
      })),
    };

    vi.mocked(getPayloadInstance).mockResolvedValue(payload as Payload);

    const newPassword = 'reset-test-credential';

    const response = await POST(
      buildRequest({
        email: 'crew@example.com',
        firstName: 'Rookie',
        lastName: 'Sailor',
        password: newPassword,
        confirmPassword: newPassword,
      }),
      { params: { token: 'reset-token-mismatch' } },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(String(body?.error ?? '')).toMatch(/changed since this reset link was issued/i);
    expect(payload.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'users',
        id: 99,
        data: expect.objectContaining({
          password: newPassword,
        }),
      }),
    );
    expect(payload.login).not.toHaveBeenCalled();
  });
});
