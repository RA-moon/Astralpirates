export type SiteMenuNodeId =
  | 'flight'
  | 'bridge'
  | 'log'
  | 'gangway'
  | 'airlock'
  | 'about'
  | 'pirates'
  | 'legal'
  | 'contact'
  | 'crew'
  | 'lair'
  | 'engineering'
  | 'control'
  | 'bay';

export type Anchor = 'top' | 'bottom' | 'left' | 'right';

export type SiteMenuNode = {
  id: SiteMenuNodeId;
  label: string;
  href: string;
};

export type SiteMenuConnector = {
  id: string;
  from: SiteMenuNodeId;
  to: SiteMenuNodeId;
  fromAnchor: Anchor;
  toAnchor: Anchor;
  elbow?: 'hv' | 'vh';
};

export type SiteMenuLayoutEntry = {
  id: SiteMenuNodeId;
  area: string;
  position: 'left' | 'center' | 'right';
  compact?: boolean;
  level?: 'core' | 'primary' | 'secondary';
};

export type SiteMenuNodeConfig = {
  id: SiteMenuNodeId;
  label: string;
  href: string;
  layout: SiteMenuLayoutEntry;
  connections?: Array<{
    to: SiteMenuNodeId;
    fromAnchor: Anchor;
    toAnchor: Anchor;
    elbow?: 'hv' | 'vh';
  }>;
};

const nodeConfigs: SiteMenuNodeConfig[] = [
  {
    id: 'flight',
    label: 'Flight-plans',
    href: '/bridge/flight-plans',
    layout: { id: 'flight', area: 'flight', position: 'left', level: 'primary' },
    connections: [
      { to: 'bridge', fromAnchor: 'right', toAnchor: 'left' },
    ],
  },
  {
    id: 'bridge',
    label: 'Bridge',
    href: '/bridge',
    layout: { id: 'bridge', area: 'bridge', position: 'center', level: 'core' },
    connections: [
      { to: 'flight', fromAnchor: 'left', toAnchor: 'right' },
      { to: 'log', fromAnchor: 'right', toAnchor: 'left' },
      { to: 'gangway', fromAnchor: 'bottom', toAnchor: 'top', elbow: 'vh' },
    ],
  },
  {
    id: 'log',
    label: 'Log-book',
    href: '/bridge/logbook',
    layout: { id: 'log', area: 'log', position: 'right', level: 'primary' },
    connections: [
      { to: 'bridge', fromAnchor: 'left', toAnchor: 'right' },
    ],
  },
  {
    id: 'airlock',
    label: 'Airlock (home)',
    href: '/',
    layout: { id: 'airlock', area: 'airlock', position: 'left', level: 'primary' },
    connections: [
      { to: 'gangway', fromAnchor: 'right', toAnchor: 'left' },
      { to: 'about', fromAnchor: 'bottom', toAnchor: 'top', elbow: 'vh' },
    ],
  },
  {
    id: 'about',
    label: 'About',
    href: '/gangway/about',
    layout: { id: 'about', area: 'about', position: 'left', level: 'primary' },
    connections: [
      { to: 'airlock', fromAnchor: 'top', toAnchor: 'bottom', elbow: 'vh' },
      { to: 'gangway', fromAnchor: 'right', toAnchor: 'left' },
      { to: 'pirates', fromAnchor: 'bottom', toAnchor: 'top', elbow: 'vh' },
      { to: 'contact', fromAnchor: 'bottom', toAnchor: 'top', elbow: 'vh' },
    ],
  },
  {
    id: 'gangway',
    label: 'Gangway',
    href: '/gangway',
    layout: { id: 'gangway', area: 'gangway', position: 'center', level: 'core' },
    connections: [
      { to: 'bridge', fromAnchor: 'top', toAnchor: 'bottom', elbow: 'vh' },
      { to: 'airlock', fromAnchor: 'left', toAnchor: 'right' },
      { to: 'lair', fromAnchor: 'right', toAnchor: 'left' },
      { to: 'crew', fromAnchor: 'right', toAnchor: 'left' },
      { to: 'engineering', fromAnchor: 'bottom', toAnchor: 'top', elbow: 'vh' },
    ],
  },
  {
    id: 'pirates',
    label: 'Pirates',
    href: '/gangway/about/pirates',
    layout: { id: 'pirates', area: 'pirates', position: 'left', compact: true, level: 'secondary' },
    connections: [{ to: 'about', fromAnchor: 'top', toAnchor: 'bottom', elbow: 'vh' }],
  },
  {
    id: 'legal',
    label: 'Legal',
    href: '/gangway/legal',
    layout: { id: 'legal', area: 'legal', position: 'left', compact: true, level: 'secondary' },
    connections: [{ to: 'about', fromAnchor: 'top', toAnchor: 'bottom', elbow: 'vh' }],
  },
  {
    id: 'contact',
    label: 'Contact',
    href: '/gangway/about/contact',
    layout: { id: 'contact', area: 'contact', position: 'left', compact: true, level: 'secondary' },
    connections: [{ to: 'about', fromAnchor: 'top', toAnchor: 'bottom', elbow: 'vh' }],
  },
  {
    id: 'lair',
    label: 'Lair',
    href: '/gangway/lair',
    layout: { id: 'lair', area: 'lair', position: 'right', level: 'secondary' },
    connections: [
      { to: 'gangway', fromAnchor: 'left', toAnchor: 'right' },
    ],
  },
  {
    id: 'crew',
    label: 'Crew-quarters',
    href: '/gangway/crew-quarters',
    layout: { id: 'crew', area: 'crew', position: 'right', level: 'primary' },
    connections: [{ to: 'gangway', fromAnchor: 'left', toAnchor: 'right' }],
  },
  {
    id: 'engineering',
    label: 'Engr.',
    href: '/gangway/engineering',
    layout: { id: 'engineering', area: 'engineering', position: 'center', level: 'core' },
    connections: [
      { to: 'gangway', fromAnchor: 'top', toAnchor: 'bottom', elbow: 'vh' },
      { to: 'control', fromAnchor: 'right', toAnchor: 'left' },
      { to: 'bay', fromAnchor: 'bottom', toAnchor: 'top', elbow: 'vh' },
    ],
  },
  {
    id: 'control',
    label: 'Control',
    href: '/gangway/engineering/control',
    layout: { id: 'control', area: 'control', position: 'right', level: 'primary' },
    connections: [
      { to: 'engineering', fromAnchor: 'left', toAnchor: 'right' },
      { to: 'bay', fromAnchor: 'bottom', toAnchor: 'top', elbow: 'vh' },
    ],
  },
  {
    id: 'bay',
    label: 'Bay',
    href: '/gangway/engineering/bay',
    layout: { id: 'bay', area: 'bay', position: 'right', level: 'secondary' },
    connections: [
      { to: 'engineering', fromAnchor: 'top', toAnchor: 'bottom', elbow: 'vh' },
      { to: 'control', fromAnchor: 'top', toAnchor: 'bottom', elbow: 'vh' },
    ],
  },
];

export const siteMenuNodes: SiteMenuNode[] = nodeConfigs.map(({ id, label, href }) => ({
  id,
  label,
  href,
}));

export const siteMenuLayout: SiteMenuLayoutEntry[] = nodeConfigs.map(({ layout }) => layout);

export const siteMenuConnectors: SiteMenuConnector[] = nodeConfigs.flatMap((config) =>
  (config.connections ?? []).map((connection) => ({
    id: `${config.id}-${connection.to}`,
    from: config.id,
    to: connection.to,
    fromAnchor: connection.fromAnchor,
    toAnchor: connection.toAnchor,
    elbow: connection.elbow,
  })),
);

export const siteMenuAlignment = siteMenuLayout.reduce<
  Record<SiteMenuNodeId, SiteMenuLayoutEntry['position']>
>((acc, entry) => {
  acc[entry.id] = entry.position;
  return acc;
}, {} as Record<SiteMenuNodeId, SiteMenuLayoutEntry['position']>);

export const siteMenuLevels = siteMenuLayout.reduce<
  Record<SiteMenuNodeId, NonNullable<SiteMenuLayoutEntry['level']>>
>((acc, entry) => {
  acc[entry.id] = entry.level ?? 'primary';
  return acc;
}, {} as Record<SiteMenuNodeId, NonNullable<SiteMenuLayoutEntry['level']>>);
