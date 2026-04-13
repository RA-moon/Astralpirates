import { defineAsyncComponent } from 'vue';
import type { Component } from 'vue';

export type UiDemoEntry = {
  id: string;
  name: string;
  description: string;
  component: ReturnType<typeof defineAsyncComponent>;
  props?: Record<string, unknown>;
};

export type UiDemoCategory = {
  id: string;
  title: string;
  description: string;
  demos: UiDemoEntry[];
};

type UiDemoLoader = () => Promise<{ default: Component }>;

type UiDemoSourceEntry = Omit<UiDemoEntry, 'component'> & {
  loader: UiDemoLoader;
};

type UiDemoSourceCategory = Omit<UiDemoCategory, 'demos'> & {
  demos: UiDemoSourceEntry[];
};

const registrySource: UiDemoSourceCategory[] = [
  {
    id: 'theme',
    title: 'Theme & Tokens',
    description:
      'Play with the shared theme primitives to validate token changes without hitting any backend resources.',
    demos: [
      {
        id: 'theme-toggle',
        name: 'Theme Toggle',
        description: 'Switch between available themes and ensure the CSS variable contract is respected.',
        loader: () => import('./ThemeToggleDemo.vue'),
      },
      {
        id: 'surface-grid',
        name: 'Surface + Layout',
        description: 'Check spacing, shadows, and typography on neutral surfaces.',
        loader: () => import('./SurfaceGridDemo.vue'),
      },
    ],
  },
  {
    id: 'foundations',
    title: 'Foundations',
    description: 'Heading, text, icon, and stack primitives rendered with sample content.',
    demos: [
      {
        id: 'typography',
        name: 'Typography scale',
        description: 'Verify heading + body sizes map to the agreed scale.',
        loader: () => import('./TypographyDemo.vue'),
      },
      {
        id: 'layout',
        name: 'Stack + Inline',
        description: 'Preview gap utilities and inline alignment without building a real form.',
        loader: () => import('./LayoutDemo.vue'),
      },
    ],
  },
  {
    id: 'forms',
    title: 'Forms & Inputs',
    description: 'Core input primitives cloned from the current live styling.',
    demos: [
      {
        id: 'forms-inputs',
        name: 'Inputs',
        description: 'Text, password, textarea, number, select, combobox examples.',
        loader: () => import('./forms/InputsDemo.vue'),
      },
      {
        id: 'forms-choice',
        name: 'Choice controls',
        description: 'Checkboxes, radios, switch, segmented control.',
        loader: () => import('./forms/ChoicesDemo.vue'),
      },
      {
        id: 'forms-multiselect',
        name: 'Multi-select',
        description: 'Searchable multi-select with staged selections and badges.',
        loader: () => import('./forms/MultiSelectDemo.vue'),
      },
      {
        id: 'forms-file-input',
        name: 'File input',
        description: 'Token-styled uploader with helper text.',
        loader: () => import('./forms/FileInputDemo.vue'),
      },
    ],
  },
  {
    id: 'actions',
    title: 'Actions',
    description: 'Buttons, icon buttons, button groups, and floating actions.',
    demos: [
      {
        id: 'actions-buttons',
        name: 'Buttons',
        description: 'Variants, icon buttons, link buttons, and floating action.',
        loader: () => import('./actions/ButtonsDemo.vue'),
      },
    ],
  },
  {
    id: 'navigation',
    title: 'Navigation & Structure',
    description: 'Accordions, tabs, carousel, breadcrumbs, pagination, and filter pills.',
    demos: [
      {
        id: 'disclosure-accordion',
        name: 'Accordion',
        description: 'Content toggles matching the current mission checklists.',
        loader: () => import('./disclosure/AccordionDemo.vue'),
      },
      {
        id: 'disclosure-tabs',
        name: 'Tabs + Collapsible',
        description: 'Crew role tabs and collapsible sections.',
        loader: () => import('./disclosure/TabsDemo.vue'),
      },
      {
        id: 'media-carousel',
        name: 'Image carousel',
        description: 'Slides inspired by the existing PageImageCarousel blocks.',
        loader: () => import('./media/ImageCarouselDemo.vue'),
      },
      {
        id: 'navigation-breadcrumb',
        name: 'Breadcrumb + Pagination',
        description: 'Navigator-friendly navigation helpers.',
        loader: () => import('./navigation/BreadcrumbDemo.vue'),
      },
      {
        id: 'navigation-filter-pills',
        name: 'Filter pills',
        description: 'Quick filter interactions for logbook/flight-plan lists.',
        loader: () => import('./navigation/FilterPillsDemo.vue'),
      },
    ],
  },
  {
    id: 'data',
    title: 'Data helpers',
    description: 'Status rows, analytics cards, and table scaffolding cloned from live pages.',
    demos: [
      {
        id: 'data-status-list',
        name: 'Status list',
        description: 'Crew roster style rows with metadata + action slots.',
        loader: () => import('./data/StatusListDemo.vue'),
      },
      {
        id: 'data-task-state-pill',
        name: 'Task state pills',
        description: 'Mission task state tokens with shared icons/colors.',
        loader: () => import('./data/TaskStatePillDemo.vue'),
      },
      {
        id: 'data-status-dot',
        name: 'Status dots',
        description: 'Inline indicators aligned with alert/metric severities.',
        loader: () => import('./data/StatusDotDemo.vue'),
      },
      {
        id: 'data-analytics-cards',
        name: 'Analytics cards',
        description: 'Stat + metric cards with shared surfaces.',
        loader: () => import('./cards/AnalyticsCardsDemo.vue'),
      },
      {
        id: 'data-task-state-pill',
        name: 'Task state pills',
        description: 'Mission task states with shared icons/colors.',
        loader: () => import('./data/TaskStatePillDemo.vue'),
      },
      {
        id: 'data-table-shell',
        name: 'Table shell',
        description: 'Table wrapper with toolbar + scoped slots.',
        loader: () => import('./data/TableShellDemo.vue'),
      },
    ],
  },
  {
    id: 'feedback',
    title: 'Feedback & Notifications',
    description: 'Tags, empty states, and toast region for inline alerts.',
    demos: [
      {
        id: 'feedback-alert',
        name: 'Alerts & notices',
        description: 'Severity-aware alerts plus inline notification layout.',
        loader: () => import('./feedback/AlertDemo.vue'),
      },
      {
        id: 'feedback-empty-state',
        name: 'Empty state',
        description: 'Bordered blank-slate pattern with icon + actions.',
        loader: () => import('./feedback/EmptyStateDemo.vue'),
      },
      {
        id: 'feedback-badge',
        name: 'Badges & counts',
        description: 'Count/status badges shared by filter triggers and nav pills.',
        loader: () => import('./feedback/BadgeDemo.vue'),
      },
      {
        id: 'feedback-tag',
        name: 'Tags / chips',
        description: 'Filter and status chips, including the closable variant.',
        loader: () => import('./feedback/TagDemo.vue'),
      },
      {
        id: 'feedback-badge-anchor',
        name: 'Anchored badges',
        description: 'Attach counts to icons or avatars.',
        loader: () => import('./feedback/BadgeAnchorDemo.vue'),
      },
      {
        id: 'feedback-toast',
        name: 'Toast region',
        description: 'Ephemeral notifications for quick feedback.',
        loader: () => import('./feedback/ToastDemo.vue'),
      },
    ],
  },
  {
    id: 'overlays',
    title: 'Overlays & Menus',
    description: 'Modals, drawers, popovers, dropdowns, context menus, tooltips, and command palette.',
    demos: [
      {
        id: 'overlays-modal',
        name: 'Modal & Drawer',
        description: 'Reusable overlay shells for auth dialogs, page editors, etc.',
        loader: () => import('./overlays/ModalDemo.vue'),
      },
      {
        id: 'overlays-popover',
        name: 'Popover, Tooltip, Dropdown, Context menu',
        description: 'Inline actions and right-click menu behaviors.',
        loader: () => import('./overlays/PopoverDemo.vue'),
      },
    ],
  },
  {
    id: 'page-clones',
    title: 'Page layouts',
    description:
      'Clones of every existing Nuxt page so we can visualise current styles before migrating to the new component library.',
    demos: [
      {
        id: 'page-marketing',
        name: 'Marketing pages',
        description: 'Represents /, /bridge, /gangway, /gangway/about/*, and /gangway/crew-quarters CMS-driven pages.',
        loader: () => import('./pages/MarketingPageDemo.vue'),
      },
      {
        id: 'page-bridge-logbook',
        name: 'Bridge · Logbook',
        description: 'Filters + log summaries shown on /bridge/logbook.',
        loader: () => import('./pages/BridgeLogbookDemo.vue'),
      },
      {
        id: 'page-bridge-flight-plans',
        name: 'Bridge · Flight plans',
        description: 'Mission list + publish form from /bridge/flight-plans.',
        loader: () => import('./pages/BridgeFlightPlansDemo.vue'),
      },
      {
        id: 'page-flight-plan-detail',
        name: 'Flight plan detail',
        description: 'Roster, invites, and log excerpts for /flight-plans/[slug].',
        loader: () => import('./pages/FlightPlanDetailDemo.vue'),
      },
      {
        id: 'page-crew-profile',
        name: 'Crew profile',
        description: 'Profile card + enlistment widgets from /gangway/crew-quarters/[slug].',
        loader: () => import('./pages/CrewProfileDemo.vue'),
      },
      {
        id: 'page-crew-enlist',
        name: 'Crew enlist',
        description: 'Invite form shown on /gangway/crew-quarters/enlist.',
        loader: () => import('./pages/CrewEnlistDemo.vue'),
      },
      {
        id: 'page-enlist-accept',
        name: 'Enlist accept',
        description: 'Token-driven registration screen at /enlist/accept.',
        loader: () => import('./pages/EnlistAcceptDemo.vue'),
      },
      {
        id: 'page-log-entry',
        name: 'Log entry detail',
        description: 'Full log view for /logbook/[slug].',
        loader: () => import('./pages/LogEntryDemo.vue'),
      },
    ],
  },
];

export const uiDemoRegistry: UiDemoCategory[] = registrySource.map((category) => ({
  ...category,
  demos: category.demos.map(({ loader, ...demo }) => ({
    ...demo,
    component: defineAsyncComponent(loader),
  })),
}));

export type UiDemoCategoryMeta = Omit<UiDemoCategory, 'demos'> & {
  demos: Array<Omit<UiDemoEntry, 'component'>>;
};

export const uiDemoMetadata: UiDemoCategoryMeta[] = registrySource.map((category) => ({
  ...category,
  demos: category.demos.map(({ loader: _loader, ...demo }) => demo),
}));
