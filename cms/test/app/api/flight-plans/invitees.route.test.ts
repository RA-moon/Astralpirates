import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

vi.mock('@/app/api/_lib/auth', () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock('@/app/api/_lib/flightPlanMembers', async () => {
  const actual = await vi.importActual<typeof import('@/app/api/_lib/flightPlanMembers')>(
    '@/app/api/_lib/flightPlanMembers',
  );
  return {
    ...actual,
    resolveFlightPlanBySlug: vi.fn(),
    loadMembershipWithOwnerFallback: vi.fn(),
  };
});

import { GET } from '@/app/api/flight-plans/[slug]/invitees/route';
import { authenticateRequest } from '@/app/api/_lib/auth';
import {
  loadMembershipWithOwnerFallback,
  resolveFlightPlanBySlug,
} from '@/app/api/_lib/flightPlanMembers';

const mockedAuthenticateRequest = vi.mocked(authenticateRequest);
const mockedResolveFlightPlanBySlug = vi.mocked(resolveFlightPlanBySlug);
const mockedLoadMembershipWithOwnerFallback = vi.mocked(loadMembershipWithOwnerFallback);

const makeRequest = (query: string) =>
  ({
    headers: new Headers(),
    nextUrl: new URL(`https://astral.test/api/flight-plans/demo/invitees?q=${encodeURIComponent(query)}`),
  }) as unknown as NextRequest;

describe('GET /api/flight-plans/:slug/invitees', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows captain admin-edit override without requiring mission membership', async () => {
    const payload = {
      find: vi.fn().mockResolvedValue({
        docs: [{ id: 52, callSign: 'Navigator', profileSlug: 'navigator', role: 'seamen' }],
      }),
      logger: {
        warn: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 77, role: 'captain' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: true,
          canUseAdminEdit: true,
        },
      },
    } as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 44,
      owner: { id: 5 },
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue(null);

    const response = await GET(makeRequest('nav'), {
      params: Promise.resolve({ slug: 'demo' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toEqual([
      {
        id: 52,
        callSign: 'Navigator',
        profileSlug: 'navigator',
        role: 'seamen',
      },
    ]);
    expect(mockedLoadMembershipWithOwnerFallback).not.toHaveBeenCalled();
  });

  it('keeps denying non-captains with spoofed admin toggles', async () => {
    const payload = {
      find: vi.fn(),
      logger: {
        warn: vi.fn(),
      },
    };
    mockedAuthenticateRequest.mockResolvedValue({
      payload,
      user: { id: 88, role: 'seamen' },
      adminMode: {
        adminViewEnabled: true,
        adminEditEnabled: true,
        eligibility: {
          canUseAdminView: false,
          canUseAdminEdit: false,
        },
      },
    } as any);
    mockedResolveFlightPlanBySlug.mockResolvedValue({
      id: 44,
      owner: { id: 5 },
    } as any);
    mockedLoadMembershipWithOwnerFallback.mockResolvedValue(null);

    const response = await GET(makeRequest('nav'), {
      params: Promise.resolve({ slug: 'demo' }),
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toMatch(/captain or crew organisers/i);
    expect(mockedLoadMembershipWithOwnerFallback).toHaveBeenCalledTimes(1);
    expect(payload.find).not.toHaveBeenCalled();
  });
});
