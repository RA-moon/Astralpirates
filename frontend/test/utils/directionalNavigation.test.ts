import { describe, expect, it } from 'vitest';

import { resolveDirectionalMap, resolveDirectionalTarget } from '~/utils/directionalNavigation';

describe('directionalNavigation', () => {
  it('returns graph-connected neighbors for gangway', () => {
    const up = resolveDirectionalTarget({ nodeId: 'gangway', direction: 'up' });
    const down = resolveDirectionalTarget({ nodeId: 'gangway', direction: 'down' });
    const left = resolveDirectionalTarget({ nodeId: 'gangway', direction: 'left' });
    const right = resolveDirectionalTarget({ nodeId: 'gangway', direction: 'right' });

    expect(up?.id).toBe('bridge');
    expect(down?.id).toBe('engineering');
    expect(left?.id).toBe('airlock');
    expect(right?.id).toBe('crew');
  });

  it('falls back to aligned grid neighbors when no connector exists', () => {
    const down = resolveDirectionalTarget({ nodeId: 'pirates', direction: 'down' });
    expect(down).toBeNull();
  });

  it('prefers column-aligned targets when multiple connectors share a direction', () => {
    const up = resolveDirectionalTarget({ nodeId: 'bay', direction: 'up' });
    expect(up?.id).toBe('control');
  });

  it('returns null when a direction is unavailable', () => {
    expect(resolveDirectionalTarget({ nodeId: 'arch', direction: 'left' })).toBeNull();
  });

  it('respects navigation override hrefs', () => {
    const left = resolveDirectionalTarget({
      nodeId: 'gangway',
      direction: 'left',
      overrides: { airlock: { href: '/custom-airlock-route' } },
    });

    expect(left?.href).toBe('/custom-airlock-route');
  });

  it('returns a directional map covering all available edges', () => {
    const map = resolveDirectionalMap({ nodeId: 'engineering' });
    expect(map.up?.id).toBe('gangway');
    expect(map.right?.id).toBe('control');
    expect(map.down?.id).toBe('bay');
    expect(map.left?.id).toBe('legal');
  });
});
