import {
  siteMenuConnectors,
  siteMenuLayout,
  siteMenuNodes,
  type Anchor,
  type SiteMenuNode,
  type SiteMenuNodeId,
} from '~/components/site-menu/schema';
import type { NavigationOverrides } from '~/utils/siteMenu';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type DirectionalTarget = {
  id: SiteMenuNodeId;
  href: string;
};

export type DirectionalTargetMap = Partial<Record<Direction, DirectionalTarget>>;

const anchorToDirection: Record<Anchor, Direction> = {
  top: 'up',
  bottom: 'down',
  left: 'left',
  right: 'right',
};

const directionList: Direction[] = ['up', 'down', 'left', 'right'];

type GridCell = SiteMenuNodeId | '.';

const siteMenuGridAreas: GridCell[][] = [
  ['.', 'flight', 'bridge', 'log'],
  ['airlock', 'airlock', 'gangway', 'lair'],
  ['about', 'about', 'gangway', 'crew'],
  ['pirates', 'contact', 'gangway', '.'],
  ['.', 'legal', 'engineering', 'control'],
  ['.', '.', 'engineering', 'bay'],
];

type Coordinate = { row: number; column: number };

const gridCoordinates: Record<SiteMenuNodeId, Coordinate> = (() => {
  const bounds = new Map<
    SiteMenuNodeId,
    { minRow: number; maxRow: number; minCol: number; maxCol: number }
  >();

  siteMenuGridAreas.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      if (cell === '.') return;
      const current = bounds.get(cell) ?? {
        minRow: rowIndex,
        maxRow: rowIndex,
        minCol: columnIndex,
        maxCol: columnIndex,
      };

      current.minRow = Math.min(current.minRow, rowIndex);
      current.maxRow = Math.max(current.maxRow, rowIndex);
      current.minCol = Math.min(current.minCol, columnIndex);
      current.maxCol = Math.max(current.maxCol, columnIndex);

      bounds.set(cell, current);
    });
  });

  const coords = {} as Record<SiteMenuNodeId, Coordinate>;

  siteMenuNodes.forEach((node) => {
    const box = bounds.get(node.id);
    if (!box) {
      throw new Error(
        `[directionalNavigation] No grid coordinates found for node "${node.id}". Keep siteMenuGridAreas in sync with the CSS grid.`,
      );
    }
    coords[node.id] = {
      row: (box.minRow + box.maxRow) / 2,
      column: (box.minCol + box.maxCol) / 2,
    };
  });

  return coords;
})();

const nodeById = siteMenuNodes.reduce<Record<SiteMenuNodeId, SiteMenuNode>>((map, node) => {
  map[node.id] = node;
  return map;
}, {} as Record<SiteMenuNodeId, SiteMenuNode>);

const layoutById = new Map(siteMenuLayout.map((entry) => [entry.id, entry]));

const connectorsByNode = siteMenuConnectors.reduce<
  Record<SiteMenuNodeId, Partial<Record<Direction, SiteMenuNodeId[]>>>
>((acc, connector) => {
  const direction = anchorToDirection[connector.fromAnchor];
  if (!direction) return acc;
  const bucket = acc[connector.from] ?? {};
  bucket[direction] = [...(bucket[direction] ?? []), connector.to];
  acc[connector.from] = bucket;
  return acc;
}, {} as Record<SiteMenuNodeId, Partial<Record<Direction, SiteMenuNodeId[]>>>);

const ROW_DISTANCE_MIN = 0.15;
const COLUMN_DISTANCE_MIN = 0.15;
const COLUMN_ALIGNMENT_TOLERANCE = 0.55;
const ROW_ALIGNMENT_TOLERANCE = 1.2;

const resolveHref = (id: SiteMenuNodeId, overrides?: NavigationOverrides | null) => {
  const overrideHref = overrides?.[id]?.href;
  if (overrideHref && overrideHref.trim().length > 0) {
    return overrideHref;
  }
  return nodeById[id]?.href ?? '#';
};

const isFocusDirection = (direction: Direction, current: Coordinate, target: Coordinate) => {
  if (direction === 'left') {
    return current.column - target.column >= COLUMN_DISTANCE_MIN;
  }
  if (direction === 'right') {
    return target.column - current.column >= COLUMN_DISTANCE_MIN;
  }
  if (direction === 'up') {
    return current.row - target.row >= ROW_DISTANCE_MIN;
  }
  if (direction === 'down') {
    return target.row - current.row >= ROW_DISTANCE_MIN;
  }
  return false;
};

const compareCandidates = (
  direction: Direction,
  current: Coordinate,
  candidateA: Coordinate,
  candidateB: Coordinate,
) => {
  if (direction === 'left' || direction === 'right') {
    const horizontalDeltaA = Math.abs(candidateA.column - current.column);
    const horizontalDeltaB = Math.abs(candidateB.column - current.column);
    if (horizontalDeltaA !== horizontalDeltaB) {
      return horizontalDeltaA - horizontalDeltaB;
    }
    const rowPenaltyA = Math.abs(candidateA.row - current.row);
    const rowPenaltyB = Math.abs(candidateB.row - current.row);
    if (rowPenaltyA !== rowPenaltyB) {
      return rowPenaltyA - rowPenaltyB;
    }
  } else {
    const columnPenaltyA = Math.abs(candidateA.column - current.column);
    const columnPenaltyB = Math.abs(candidateB.column - current.column);
    if (columnPenaltyA !== columnPenaltyB) {
      return columnPenaltyA - columnPenaltyB;
    }
    const rowDistanceA = Math.abs(candidateA.row - current.row);
    const rowDistanceB = Math.abs(candidateB.row - current.row);
    if (rowDistanceA !== rowDistanceB) {
      return rowDistanceA - rowDistanceB;
    }
  }
  return 0;
};

const fallbackNeighbor = (nodeId: SiteMenuNodeId, direction: Direction): SiteMenuNodeId | null => {
  const origin = gridCoordinates[nodeId];
  if (!origin) return null;

  let best: { id: SiteMenuNodeId; coord: Coordinate } | null = null;

  siteMenuNodes.forEach((candidate) => {
    if (candidate.id === nodeId) return;
    const targetCoord = gridCoordinates[candidate.id];
    if (!targetCoord) return;
    if (!isFocusDirection(direction, origin, targetCoord)) return;

    if (direction === 'left' || direction === 'right') {
      const rowOffset = Math.abs(targetCoord.row - origin.row);
      if (rowOffset > ROW_ALIGNMENT_TOLERANCE) return;
    } else {
      const columnOffset = Math.abs(targetCoord.column - origin.column);
      if (columnOffset > COLUMN_ALIGNMENT_TOLERANCE) return;
    }

    if (!best) {
      best = { id: candidate.id, coord: targetCoord };
      return;
    }

    const comparison = compareCandidates(direction, origin, targetCoord, best.coord);
    if (comparison < 0) {
      best = { id: candidate.id, coord: targetCoord };
    }
  });

  return best ? (best as { id: SiteMenuNodeId }).id : null;
};

const pickConnectorTarget = (
  nodeId: SiteMenuNodeId,
  direction: Direction,
): SiteMenuNodeId | null => {
  const origin = gridCoordinates[nodeId];
  const candidates = connectorsByNode[nodeId]?.[direction];
  if (!origin || !candidates?.length) return null;

  const scored: Array<{ id: SiteMenuNodeId; coord: Coordinate }> = candidates
    .map((targetId) => {
      const coord = gridCoordinates[targetId];
      return coord ? { id: targetId, coord } : null;
    })
    .filter((entry): entry is { id: SiteMenuNodeId; coord: Coordinate } => Boolean(entry))
    .filter((entry) => isFocusDirection(direction, origin, entry.coord))
    .sort((a, b) => compareCandidates(direction, origin, a.coord, b.coord));

  const best = scored[0];
  return best ? best.id : null;
};

export const resolveDirectionalTarget = ({
  nodeId,
  direction,
  overrides,
}: {
  nodeId: SiteMenuNodeId | null | undefined;
  direction: Direction;
  overrides?: NavigationOverrides | null;
}): DirectionalTarget | null => {
  if (!nodeId) return null;
  const primary = pickConnectorTarget(nodeId, direction);
  const fallback = !primary ? fallbackNeighbor(nodeId, direction) : null;
  const targetId = primary ?? fallback;
  if (!targetId) return null;
  return {
    id: targetId,
    href: resolveHref(targetId, overrides),
  };
};

export const resolveDirectionalMap = ({
  nodeId,
  overrides,
}: {
  nodeId: SiteMenuNodeId | null | undefined;
  overrides?: NavigationOverrides | null;
}): DirectionalTargetMap => {
  if (!nodeId) return {};
  return directionList.reduce<DirectionalTargetMap>((map, direction) => {
    const target = resolveDirectionalTarget({ nodeId, direction, overrides });
    if (target) {
      map[direction] = target;
    }
    return map;
  }, {});
};

export const siteMenuGrid = {
  areas: siteMenuGridAreas,
  coordinates: gridCoordinates,
  layoutLevels: layoutById,
};
