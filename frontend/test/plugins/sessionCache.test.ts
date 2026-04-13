import { describe, expect, it, vi } from 'vitest';

vi.mock('#app', () => ({
  defineNuxtPlugin: (plugin: unknown) => plugin,
}));

vi.mock('~/utils/logs', () => ({
  clearLogNeighborCache: vi.fn(),
  clearMissionSummaryCache: vi.fn(),
}));

describe('session cache helper', () => {
  it('clears both log-related caches', async () => {
    const { clearSessionDependentCaches } = await import('~/plugins/session.client');
    const { clearLogNeighborCache, clearMissionSummaryCache } = await import('~/utils/logs');
    const clearNeighbor = vi.mocked(clearLogNeighborCache);
    const clearMission = vi.mocked(clearMissionSummaryCache);

    clearSessionDependentCaches();

    expect(clearNeighbor).toHaveBeenCalledTimes(1);
    expect(clearMission).toHaveBeenCalledTimes(1);
  });
});
