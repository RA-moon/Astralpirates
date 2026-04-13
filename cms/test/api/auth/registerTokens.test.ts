import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Payload } from 'payload';
import type { NextRequest } from 'next/server';

import type { CrewRole } from '@astralpirates/shared/crewRoles';
import { POST } from '@/app/api/auth/register/[token]/route.ts';
import { getPayloadInstance } from '@/app/lib/payload';

vi.mock('@/app/lib/payload', () => ({
  getPayloadInstance: vi.fn(),
}));

type MockRequestBody = {
  email: string;
  firstName: string;
  lastName: string;
  callSign: string;
  password: string;
  confirmPassword: string;
};

const TOKEN_ID = 987;
const INVITER_ID = 42;

const buildRequest = (body: MockRequestBody) =>
  ({
    method: 'POST',
    headers: new Headers({
      Origin: 'https://crew.test',
      'Content-Type': 'application/json',
    }),
    json: async () => body,
  }) as unknown as NextRequest;

const createTokenDoc = () => ({
  id: TOKEN_ID,
  token: 'captains-gift',
  email: 'recruit@example.com',
  firstName: 'Rookie',
  lastName: 'Sailor',
  createdAt: '2025-01-05T00:00:00.000Z',
  expiresAt: '2099-01-01T00:00:00.000Z',
  used: false,
  inviter: INVITER_ID,
});

const baseBody: MockRequestBody = {
  email: 'recruit@example.com',
  firstName: 'Rookie',
  lastName: 'Sailor',
  callSign: 'Nebula Scout',
  password: 'passphrase!',
  confirmPassword: 'passphrase!',
};

const setupPayload = (inviterRole: CrewRole) => {
  const tokenDoc = createTokenDoc();
  const payload: Partial<Payload> & {
    create: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    findByID: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    login: ReturnType<typeof vi.fn>;
    logger: { warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
    config: { cookiePrefix: string; serverURL: string };
  } = {
    config: {
      cookiePrefix: 'payload',
      serverURL: 'https://cms.test',
    },
    logger: {
      warn: vi.fn(),
      error: vi.fn(),
    },
    find: vi.fn(async (args: { collection: string }) => {
      if (args.collection === 'registration-tokens') {
        return {
          docs: [tokenDoc],
          totalDocs: 1,
        };
      }
      return {
        docs: [],
        totalDocs: 0,
      };
    }),
    findByID: vi.fn(async () => ({
      id: INVITER_ID,
      role: inviterRole,
      invite: {
        sentAt: '2025-01-05T00:00:00.000Z',
      },
    })),
    create: vi.fn(async () => ({ id: 777 })),
    update: vi.fn(async () => ({})),
    login: vi.fn(async () => ({
      token: 'mock-token',
      user: { id: 777 },
      exp: Math.floor(Date.now() / 1000) + 3600,
    })),
  };

  vi.mocked(getPayloadInstance).mockResolvedValue(payload as Payload);
  return payload;
};

describe('register route ELSA grants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('awards 3 starter tokens to captain-invited recruits', async () => {
    const payload = setupPayload('captain');
    const response = await POST(buildRequest(baseBody), { params: { token: 'captains-gift' } });

    expect(response.status).toBe(201);
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ elsaTokens: 0 }),
      }),
    );
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ elsaTokens: 3 }),
      }),
    );
  });

  it('defaults to zero tokens for non-captain invitations', async () => {
    const payload = setupPayload('swabbie');
    const response = await POST(buildRequest(baseBody), { params: { token: 'captains-gift' } });

    expect(response.status).toBe(201);
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ elsaTokens: 0 }),
      }),
    );
    expect(
      payload.update.mock.calls.some(
        ([args]) => typeof args === 'object' && 'data' in (args as any) && (args as any).data?.elsaTokens === 3,
      ),
    ).toBe(false);
  });
});
