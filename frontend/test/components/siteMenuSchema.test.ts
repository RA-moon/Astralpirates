import { describe, expect, it } from 'vitest';
import { siteMenuConnectors, siteMenuLayout, siteMenuNodes } from '~/components/site-menu/schema';

describe('site menu schema', () => {
  it('has unique node ids', () => {
    const ids = siteMenuNodes.map((node) => node.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('layout references declared nodes', () => {
    const nodeIds = new Set(siteMenuNodes.map((node) => node.id));
    for (const entry of siteMenuLayout) {
      expect(nodeIds.has(entry.id)).toBe(true);
    }
  });

  it('connectors reference valid nodes', () => {
    const nodeIds = new Set(siteMenuNodes.map((node) => node.id));
    for (const connector of siteMenuConnectors) {
      expect(nodeIds.has(connector.from)).toBe(true);
      expect(nodeIds.has(connector.to)).toBe(true);
    }
  });

  it('layout entries include level and position defaults', () => {
    const positions: Array<'left' | 'center' | 'right'> = ['left', 'center', 'right'];
    const levels: Array<'core' | 'primary' | 'secondary'> = ['core', 'primary', 'secondary'];
    for (const entry of siteMenuLayout) {
      expect(positions).toContain(entry.position);
      if (entry.level) {
        expect(levels).toContain(entry.level);
      }
    }
  });
});
