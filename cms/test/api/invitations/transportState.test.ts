import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeRedis } from '../../helpers/fakeRedis';

const fakeRedis = new FakeRedis();

vi.mock('@/src/utils/redisClient', () => ({
  getRedisClient: () => fakeRedis,
}));

import {
  getEmailTransportStatus,
  markEmailTransportFailure,
  markEmailTransportRecovered,
  resetEmailTransportState,
  type EmailTransportSnapshot,
} from '../../../app/api/invitations/transportState.ts';

const SNAPSHOT: EmailTransportSnapshot = {
  code: 'EAUTH',
  message: 'Authentication failed',
};

describe('email transport state', () => {
  beforeEach(async () => {
    fakeRedis.clear();
    await resetEmailTransportState();
    vi.useRealTimers();
  });

  it('reports offline after auth failures and recovers after cooldown', async () => {
    await markEmailTransportFailure({ snapshot: SNAPSHOT, cooldownMs: 10_000 });
    const offlineStatus = await getEmailTransportStatus();
    expect(offlineStatus.offline).toBe(true);
    expect(offlineStatus.lastError).toEqual(SNAPSHOT);
    expect(offlineStatus.retryAt).toBeTruthy();

    vi.useFakeTimers();
    vi.advanceTimersByTime(10_000);

    const recoveredStatus = await getEmailTransportStatus();
    expect(recoveredStatus.offline).toBe(false);
    expect(recoveredStatus.retryAt).toBeNull();
    expect(recoveredStatus.lastError).toBeNull();
  });

  it('clears overrides when the transport recovers manually', async () => {
    await markEmailTransportFailure({ snapshot: SNAPSHOT, cooldownMs: 30_000 });
    await markEmailTransportRecovered();

    const status = await getEmailTransportStatus();
    expect(status.offline).toBe(false);
    expect(status.retryAt).toBeNull();
    expect(status.lastError).toBeNull();
  });
});
