import type {
  CrewSummary,
  FlightPlanSummary,
  Link,
  LogSummary,
  PageBlock,
  RichTextContent,
} from '@astralpirates/shared/api-contracts';

const now = new Date().toISOString();

export const toRichText = (paragraphs: string[]): RichTextContent =>
  paragraphs.map((text) => ({
    type: 'paragraph',
    children: [{ text }],
  }));

export const sampleCrew: CrewSummary = {
  id: 1,
  profileSlug: 'nova',
  displayName: 'Nova',
  callSign: 'Nova',
  role: 'captain',
  avatarUrl: 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=facearea&w=200&h=200&q=80',
};

export const sampleCrewB: CrewSummary = {
  id: 2,
  profileSlug: 'vector',
  displayName: 'Vector',
  callSign: 'Vector',
  role: 'navigator',
  avatarUrl: 'https://images.unsplash.com/photo-1529665253569-6d01c0eaf7b6?auto=format&fit=facearea&w=200&h=200&q=80',
};

export const sampleCrewC: CrewSummary = {
  id: 3,
  profileSlug: 'sparrow',
  displayName: 'Sparrow',
  callSign: 'Sparrow',
  role: 'science',
  avatarUrl: 'https://images.unsplash.com/photo-1463453091185-61582044d556?auto=format&fit=facearea&w=200&h=200&q=80',
};

export const sampleLinks: Link[] = [
  { label: 'Open the gangway', href: '/gangway', style: 'primary' },
  { label: 'Visit the bridge', href: '/bridge', style: 'secondary' },
];

export const sampleHeroBlock: PageBlock = {
  blockType: 'hero',
  eyebrow: 'Latest transmission',
  title: 'Crew-wide broadcast',
  tagline: toRichText(['A living styleguide to coordinate bridge, gangway, and airlock surfaces.']),
  body: toRichText([
    'Feed any sample payload into the editor to preview how this block renders. Perfect for iterating on CMS layouts before publishing.',
  ]),
  ctas: sampleLinks,
};

export const sampleCardGridBlock: PageBlock = {
  blockType: 'cardGrid',
  title: 'Mission kits',
  intro: toRichText([
    'Card grids support static copy, internal links, or auto-populated feeds. Keep summaries concise for readability.',
  ]),
  columns: 'two',
  cards: [
    {
      variant: 'static',
      badge: 'Brief',
      title: 'Helm simulator',
      body: toRichText([
        'Spin up the training bridge to teach new pirates how navigation and comms updates flow through the flotilla.',
      ]),
      ctas: [{ label: 'Launch simulator', href: '/bridge', style: 'primary' }],
    },
    {
      variant: 'static',
      badge: 'Resources',
      title: 'Signal playbook',
      body: toRichText([
        'Document the cadence for sending transmissions so every department knows when to expect updates.',
      ]),
      ctas: [{ label: 'Open docs', href: '/gangway/about/pirates', style: 'secondary' }],
    },
  ],
};

export const sampleCTAListBlock: PageBlock = {
  blockType: 'ctaList',
  title: 'Crew actions',
  intro: toRichText(['Stack individual CTA cards with optional descriptions for faster scannability.']),
  items: [
    {
      title: 'Broadcast a log',
      description: toRichText(['Share a quick dispatch from the bridge.']),
      cta: { label: 'Captain’s log', href: '/bridge/logbook', style: 'primary' },
    },
    {
      title: 'Chart a flight plan',
      description: toRichText(['Schedule the next build night or plan a scout mission.']),
      cta: { label: 'Draft mission', href: '/bridge/flight-plans', style: 'secondary' },
    },
  ],
};

export const sampleStatGridBlock: PageBlock = {
  blockType: 'statGrid',
  title: 'Fleet telemetry',
  intro: toRichText(['Use stat grids for quick metrics. Values are strings so you can include units.']),
  stats: [
    { value: '18', label: 'Crew on deck' },
    { value: '12', label: 'Active missions' },
    { value: '47', label: 'Archived logs' },
  ],
  ctas: [{ label: 'View bridge metrics', href: '/bridge', style: 'link' }],
};

type StatCardSample = {
  label: string;
  value: string | number;
  meta?: string;
};

type MetricCardSample = {
  label: string;
  value: string | number;
  trend?: { type: 'up' | 'down' | 'neutral'; text: string };
  description?: string;
};

export const sampleStatCards: StatCardSample[] = [
  { label: 'Crew on deck', value: '18', meta: '+3 vs yesterday' },
  { label: 'Active missions', value: '12', meta: '4 launching tonight' },
  { label: 'Signals routed', value: '47', meta: 'Across 6 arches' },
];

export const sampleMetricCards: MetricCardSample[] = [
  {
    label: 'Signal uptime',
    value: '99.98%',
    trend: { type: 'up', text: '+0.02% vs last week' },
    description: 'Primary + backup relays combined.',
  },
  {
    label: 'Hangar readiness',
    value: '87%',
    trend: { type: 'down', text: '-3% vs goal' },
    description: 'Waiting on coolant recharge.',
  },
  {
    label: 'Flight approvals',
    value: '24h',
    trend: { type: 'neutral', text: 'Holding steady' },
    description: 'Average time to approve new plans.',
  },
];

export const sampleTableColumns = [
  { key: 'crew', label: 'Crew' },
  { key: 'role', label: 'Role' },
  { key: 'status', label: 'Status' },
  { key: 'shift', label: 'Shift' },
];

export const sampleCrewTableRows = [
  { id: 'crew-1', crew: 'Nova', role: 'Captain', status: 'Online', shift: 'Night cycle' },
  { id: 'crew-2', crew: 'Vector', role: 'Navigator', status: 'Standby', shift: 'Dawn cycle' },
  { id: 'crew-3', crew: 'Sparrow', role: 'Science', status: 'Offline', shift: 'Maintenance' },
  { id: 'crew-4', crew: 'Lyric', role: 'Engineer', status: 'Online', shift: 'Dock rotation' },
];

export const sampleLogSummaries: LogSummary[] = [
  {
    id: 10,
    title: 'Docking rehearsal report',
    slug: 'docking-rehearsal',
    path: '/logbook/docking-rehearsal',
    href: '/logbook/docking-rehearsal',
    body: 'Short status update',
    dateCode: 'SD-2404',
    logDate: now,
    headline: 'Docking rehearsal complete',
    createdAt: now,
    updatedAt: now,
    tagline: null,
    summary: null,
    excerpt: null,
    displayLabel: null,
    owner: sampleCrew,
    flightPlanId: 42,
  },
  {
    id: 11,
    title: 'Signal boost success',
    slug: 'signal-boost-success',
    path: '/logbook/signal-boost-success',
    href: '/logbook/signal-boost-success',
    body: 'Boosted comms array across the flotilla.',
    dateCode: 'SD-2405',
    logDate: now,
    headline: 'Signal boost routed through the arch',
    createdAt: now,
    updatedAt: now,
    tagline: null,
    summary: null,
    excerpt: null,
    displayLabel: null,
    owner: sampleCrewB,
    flightPlanId: null,
  },
];

export const sampleFlightPlanSummaries: FlightPlanSummary[] = [
  {
    id: 21,
    title: 'Midnight maintenance window',
    slug: 'midnight-maintenance',
    href: '/flight-plans/midnight-maintenance',
    summary: 'Hot-swap starboard relays and reroute backup power.',
    body: toRichText(['Plan out the maintenance tasks for the midnight shift.']),
    location: 'Arch hangar',
    dateCode: 'FP-221',
    displayDate: 'Apr 26, 2025',
    eventDate: now,
    date: now,
    ctaLabel: null,
    ctaHref: null,
    category: 'project',
    status: 'planned',
    statusBucket: 'archived',
    statusChangedAt: null,
    statusChangedBy: null,
    statusReason: null,
    startedAt: null,
    finishedAt: null,
    series: null,
    iterationNumber: 1,
    previousIterationId: null,
    createdAt: now,
    updatedAt: now,
    owner: sampleCrew,
    crewPreview: [sampleCrew, sampleCrewB, sampleCrewC],
    crewCanPromotePassengers: false,
    passengersCanCreateTasks: false,
    isPublic: true,
    publicContributions: false,
    gallerySlides: [],
  },
  {
    id: 22,
    title: 'Outer marker scouting',
    slug: 'outer-marker-scouting',
    href: '/flight-plans/outer-marker-scouting',
    summary: 'Scout the boundary beacons and log anomalies.',
    body: toRichText(['Assemble a small crew to scan the outer markers.']),
    location: 'Outer marker 7',
    dateCode: 'FP-222',
    displayDate: 'May 3, 2025',
    eventDate: now,
    date: now,
    ctaLabel: null,
    ctaHref: null,
    category: 'event',
    status: 'pending',
    statusBucket: 'archived',
    statusChangedAt: null,
    statusChangedBy: null,
    statusReason: null,
    startedAt: null,
    finishedAt: null,
    series: null,
    iterationNumber: 1,
    previousIterationId: null,
    createdAt: now,
    updatedAt: now,
    owner: sampleCrewB,
    crewPreview: [sampleCrewB, sampleCrewC],
    crewCanPromotePassengers: false,
    passengersCanCreateTasks: false,
    isPublic: true,
    publicContributions: false,
    gallerySlides: [],
  },
];

export const sampleCarouselSlides = [
  {
    label: 'Docking rehearsal',
    caption: 'Navigation crew practising EVA maneuvers against the Arch hull mockup.',
    imageUrl:
      'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1600&q=80',
    imageAlt: 'Astronaut floating above Earth tethered to a spacecraft.',
    creditLabel: 'NASA / Bill Ingalls',
    creditUrl: 'https://www.nasa.gov/',
  },
  {
    label: 'Signal boost',
    caption: 'Bridge relays rerouted through the freshly-aligned antenna array.',
    imageUrl:
      'https://images.unsplash.com/photo-1447433865958-f402f562b843?auto=format&fit=crop&w=1600&q=80',
    imageAlt: 'Satellite array above a planet.',
    creditLabel: 'ESA',
    creditUrl: 'https://www.esa.int/',
  },
];

export const sampleStats = [
  { label: 'Crew on deck', value: '18', meta: '+2 vs last week' },
  { label: 'Active missions', value: '12', meta: '3 scheduled' },
  { label: 'Archived logs', value: '47', meta: '0 flagged' },
];

export const sampleTableRows = [
  { id: 1, title: 'Midnight maintenance', owner: 'Nova', status: 'Scheduled' },
  { id: 2, title: 'Outer marker scouting', owner: 'Vector', status: 'Planning' },
  { id: 3, title: 'Signal boost', owner: 'Sparrow', status: 'Complete' },
];
