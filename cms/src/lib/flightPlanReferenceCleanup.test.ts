import { describe, expect, it } from 'vitest';

import {
  buildFlightPlanReferencePathSet,
  rewriteLayoutFlightPlanReferences,
  shouldClearNavigationSourcePath,
} from './flightPlanReferenceCleanup';

describe('flightPlanReferenceCleanup', () => {
  it('builds comparable reference paths from slug and path', () => {
    const paths = buildFlightPlanReferencePathSet({
      slug: '20260305-dome-project',
      path: 'bridge/flight-plans/20260305-dome-project',
    });

    expect(paths.has('/bridge/flight-plans/20260305-dome-project')).toBe(true);
    expect(paths.has('/flight-plans/20260305-dome-project')).toBe(true);
    expect(paths.has('/events/20260305-dome-project')).toBe(true);
  });

  it('rewrites matching href/path references inside nested page layout structures', () => {
    const targetPaths = buildFlightPlanReferencePathSet({
      slug: '20260305-dome-project',
      path: 'bridge/flight-plans/20260305-dome-project',
    });

    const layout = [
      {
        blockType: 'hero',
        ctas: [
          {
            label: 'Open mission',
            href: '/bridge/flight-plans/20260305-dome-project',
          },
          {
            label: 'External',
            href: 'https://example.com/docs',
          },
        ],
      },
      {
        blockType: 'navigationModule',
        path: 'bridge/flight-plans/20260305-dome-project',
      },
    ];

    const result = rewriteLayoutFlightPlanReferences({
      layout,
      targetPaths,
    });

    expect(result.changed).toBe(true);
    expect(result.rewrites).toBe(2);
    expect((result.layout as any[])[0].ctas[0].href).toBe('/bridge/flight-plans');
    expect((result.layout as any[])[0].ctas[1].href).toBe('https://example.com/docs');
    expect((result.layout as any[])[1].path).toBe('/bridge/flight-plans');
  });

  it('leaves layout unchanged when no target reference is present', () => {
    const targetPaths = buildFlightPlanReferencePathSet({
      slug: '20260305-dome-project',
      path: 'bridge/flight-plans/20260305-dome-project',
    });

    const layout = [
      {
        blockType: 'hero',
        ctas: [{ label: 'Bridge', href: '/bridge' }],
      },
    ];

    const result = rewriteLayoutFlightPlanReferences({
      layout,
      targetPaths,
    });

    expect(result.changed).toBe(false);
    expect(result.rewrites).toBe(0);
    expect(result.layout).toBe(layout);
  });

  it('detects navigation source paths that should be cleared', () => {
    const targetPaths = buildFlightPlanReferencePathSet({
      slug: '20260305-dome-project',
      path: null,
    });

    expect(
      shouldClearNavigationSourcePath({
        sourcePath: '/bridge/flight-plans/20260305-dome-project',
        targetPaths,
      }),
    ).toBe(true);
    expect(
      shouldClearNavigationSourcePath({
        sourcePath: '/bridge',
        targetPaths,
      }),
    ).toBe(false);
  });
});
