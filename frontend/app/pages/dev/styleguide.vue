++ plain
<template>
  <section class="container page page-styleguide" data-styleguide-root>
    <header class="page-header">
      <span class="eyebrow">Developer tools</span>
      <UiHeading :level="1" class="animated-title">Living styleguide</UiHeading>
      <p class="tagline">
        Inspect key UI elements, tweak their sample data, and copy reference markup while you iterate locally.
      </p>
      <div class="cta-group">
        <UiLinkButton to="/" variant="secondary">Return to the airlock</UiLinkButton>
        <UiLinkButton as="a" href="#styleguide-components" variant="secondary">Jump to components</UiLinkButton>
      </div>
    </header>

    <nav class="styleguide-nav" aria-label="Styleguide sections">
      <a class="styleguide-nav__link" href="#styleguide-tokens">Tokens</a>
      <a class="styleguide-nav__link" href="#styleguide-components">Blocks</a>
      <a class="styleguide-nav__link" href="#styleguide-ctas">Calls to action</a>
    </nav>

    <section id="styleguide-tokens" class="styleguide-section">
      <header class="styleguide-section__header">
        <UiHeading :level="2" class="animated-title">Core tokens</UiHeading>
        <p class="styleguide-section__description">
          Base typography and utility classes that underpin every screen. Edit directly in
          <code>~/assets/css/base.css</code> when a token needs to change globally.
        </p>
      </header>

      <div class="styleguide-swatch-grid">
        <div class="styleguide-swatch">
          <span class="styleguide-swatch__chip styleguide-swatch__chip--primary"></span>
          <span class="styleguide-swatch__label">Primary glow</span>
          <code class="styleguide-swatch__token">rgba(255, 0, 64)</code>
        </div>
        <div class="styleguide-swatch">
          <span class="styleguide-swatch__chip styleguide-swatch__chip--accent"></span>
          <span class="styleguide-swatch__label">Accent blue</span>
          <code class="styleguide-swatch__token">rgba(0, 192, 255)</code>
        </div>
        <div class="styleguide-swatch">
          <span class="styleguide-swatch__chip styleguide-swatch__chip--success"></span>
          <span class="styleguide-swatch__label">Success green</span>
          <code class="styleguide-swatch__token">rgba(34, 221, 0)</code>
        </div>
        <div class="styleguide-swatch">
          <span class="styleguide-swatch__chip styleguide-swatch__chip--surface"></span>
          <span class="styleguide-swatch__label">Panel surface</span>
          <code class="styleguide-swatch__token">rgba(255, 255, 255, 0.08)</code>
        </div>
      </div>

      <div class="styleguide-typography">
        <div>
          <span class="eyebrow">Heading scale</span>
          <UiHeading :level="1">Heading one</UiHeading>
          <UiHeading :level="2">Heading two</UiHeading>
          <UiHeading :level="3">Heading three</UiHeading>
          <UiHeading :level="4">Heading four</UiHeading>
        </div>
        <div>
          <span class="eyebrow">Body copy</span>
          <p>
            Astral Pirates blends archival storytelling with live crew updates. Body text runs at
            <code>line-height: 1.7</code> and leans on the <strong>Special&nbsp;Elite</strong> font stack.
          </p>
        </div>
      </div>
    </section>

    <section id="styleguide-components" class="styleguide-section">
      <header class="styleguide-section__header">
        <UiHeading :level="2" class="animated-title">Editable blocks</UiHeading>
        <p class="styleguide-section__description">
          Update the JSON payload on the right to preview changes instantly. Reset returns the sample data that mirrors
          our most common layouts.
        </p>
      </header>

      <div class="styleguide-preview">
        <div class="styleguide-preview__component">
          <PageHeroBlock :block="heroEditor.data" />
        </div>
        <div class="styleguide-preview__editor">
          <header class="styleguide-preview__editor-header">
            <UiHeading :level="3">Hero block payload</UiHeading>
            <UiButton type="button" variant="secondary" @click="heroEditor.reset">Reset sample</UiButton>
          </header>
          <UiTextArea
            v-model="heroEditor.source.value"
            class="styleguide-preview__input"
            spellcheck="false"
            aria-label="Hero block JSON"
          />
          <UiAlert v-if="heroEditor.error" class="styleguide-preview__error" variant="danger" layout="inline">
            {{ heroEditor.error }}
          </UiAlert>
        </div>
      </div>

      <div class="styleguide-preview">
        <div class="styleguide-preview__component">
          <PageCardGridBlock :block="cardGridEditor.data" />
        </div>
        <div class="styleguide-preview__editor">
          <header class="styleguide-preview__editor-header">
            <UiHeading :level="3">Card grid payload</UiHeading>
            <UiButton type="button" variant="secondary" @click="cardGridEditor.reset">
              Reset sample
            </UiButton>
          </header>
          <UiTextArea
            v-model="cardGridEditor.source.value"
            class="styleguide-preview__input"
            spellcheck="false"
            aria-label="Card grid block JSON"
          />
          <UiAlert v-if="cardGridEditor.error" class="styleguide-preview__error" variant="danger" layout="inline">
            {{ cardGridEditor.error }}
          </UiAlert>
        </div>
      </div>

      <div class="styleguide-preview">
        <div class="styleguide-preview__component">
          <PageCTAListBlock :block="ctaListEditor.data" />
        </div>
        <div class="styleguide-preview__editor">
          <header class="styleguide-preview__editor-header">
            <UiHeading :level="3">CTA list payload</UiHeading>
            <UiButton type="button" variant="secondary" @click="ctaListEditor.reset">Reset sample</UiButton>
          </header>
          <UiTextArea
            v-model="ctaListEditor.source.value"
            class="styleguide-preview__input"
            spellcheck="false"
            aria-label="CTA list block JSON"
          />
          <UiAlert v-if="ctaListEditor.error" class="styleguide-preview__error" variant="danger" layout="inline">
            {{ ctaListEditor.error }}
          </UiAlert>
        </div>
      </div>

      <div class="styleguide-preview">
        <div class="styleguide-preview__component">
          <PageStatGridBlock :block="statGridEditor.data" />
        </div>
        <div class="styleguide-preview__editor">
          <header class="styleguide-preview__editor-header">
            <UiHeading :level="3">Stat grid payload</UiHeading>
            <UiButton type="button" variant="secondary" @click="statGridEditor.reset">Reset sample</UiButton>
          </header>
          <UiTextArea
            v-model="statGridEditor.source.value"
            class="styleguide-preview__input"
            spellcheck="false"
            aria-label="Stat grid block JSON"
          />
          <UiAlert v-if="statGridEditor.error" class="styleguide-preview__error" variant="danger" layout="inline">
            {{ statGridEditor.error }}
          </UiAlert>
        </div>
      </div>

      <div class="styleguide-preview">
        <div class="styleguide-preview__component">
          <PageTimelineBlock :block="timelineEditor.data" />
        </div>
        <div class="styleguide-preview__editor">
          <header class="styleguide-preview__editor-header">
            <UiHeading :level="3">Timeline payload</UiHeading>
            <UiButton type="button" variant="secondary" @click="timelineEditor.reset">Reset sample</UiButton>
          </header>
          <UiTextArea
            v-model="timelineEditor.source.value"
            class="styleguide-preview__input"
            spellcheck="false"
            aria-label="Timeline block JSON"
          />
          <UiAlert v-if="timelineEditor.error" class="styleguide-preview__error" variant="danger" layout="inline">
            {{ timelineEditor.error }}
          </UiAlert>
        </div>
      </div>

      <div class="styleguide-preview">
        <div class="styleguide-preview__component">
          <PageImageCarouselBlock :block="imageCarouselEditor.data" />
        </div>
        <div class="styleguide-preview__editor">
          <header class="styleguide-preview__editor-header">
            <UiHeading :level="3">Image carousel payload</UiHeading>
            <UiButton type="button" variant="secondary" @click="imageCarouselEditor.reset">
              Reset sample
            </UiButton>
          </header>
          <UiTextArea
            v-model="imageCarouselEditor.source.value"
            class="styleguide-preview__input"
            spellcheck="false"
            aria-label="Image carousel block JSON"
          />
          <UiAlert v-if="imageCarouselEditor.error" class="styleguide-preview__error" variant="danger" layout="inline">
            {{ imageCarouselEditor.error }}
          </UiAlert>
        </div>
      </div>
    </section>

    <section id="styleguide-ctas" class="styleguide-section">
      <header class="styleguide-section__header">
        <h2 class="animated-title">CTA variants</h2>
        <p class="styleguide-section__description">
          These mappings align with <code>resolveCtaAttributes</code>. Use the <code>style</code> field on links to swap
          between primary, secondary, or bare link treatments.
        </p>
      </header>
      <div class="styleguide-cta-grid">
        <PageLinkButton :cta="{ label: 'Primary CTA', href: '#', style: 'primary' }" />
        <PageLinkButton :cta="{ label: 'Secondary CTA', href: '#', style: 'secondary' }" />
        <PageLinkButton :cta="{ label: 'Subtle link', href: '#', style: 'link' }">Subtle link</PageLinkButton>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { createError } from '#imports';

import PageCardGridBlock from '~/components/page-blocks/PageCardGridBlock.vue';
import PageCTAListBlock from '~/components/page-blocks/PageCTAListBlock.vue';
import PageHeroBlock from '~/components/page-blocks/PageHeroBlock.vue';
import PageImageCarouselBlock from '~/components/page-blocks/PageImageCarouselBlock.vue';
import PageLinkButton from '~/components/PageLinkButton.vue';
import PageStatGridBlock from '~/components/page-blocks/PageStatGridBlock.vue';
import PageTimelineBlock from '~/components/page-blocks/PageTimelineBlock.vue';
import { UiAlert, UiButton, UiHeading, UiLinkButton, UiTextArea } from '~/components/ui';
import type {
  CardGridBlock,
  CTAListBlock,
  ImageCarouselBlock,
  HeroBlock,
  Link,
  RichTextContent,
  StatGridBlock,
  TimelineBlock,
} from '~/modules/api/schemas';

import { createEditableBlock } from '~/utils/editableBlock';

definePageMeta({
  layout: 'default',
});

if (import.meta.server && !process.dev) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Not Found',
  });
}

const toRichText = (paragraphs: string[]): RichTextContent =>
  paragraphs.map((text) => ({
    type: 'paragraph',
    children: [{ text }],
  }));

const ensureLinks = (links: any, fallback: Link[]): Link[] => {
  return Array.isArray(links) ? links.filter((link): link is Link => !!link?.label && !!link?.href) : fallback;
};

const heroFallback: HeroBlock = {
  blockType: 'hero',
  eyebrow: 'Latest transmission',
  title: 'Crew-wide broadcast',
  tagline: toRichText(['A living styleguide to coordinate bridge, gangway, and airlock surfaces.']),
  body: toRichText([
    'Feed any sample payload into the editor to preview how this block renders. Perfect for iterating on CMS layouts before publishing.',
  ]),
  ctas: [
    { label: 'Open the gangway', href: '/gangway', style: 'primary' },
    { label: 'Visit the bridge', href: '/bridge', style: 'secondary' },
  ],
};

const cardGridFallback: CardGridBlock = {
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

const ctaListFallback: CTAListBlock = {
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

const statGridFallback: StatGridBlock = {
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

const timelineFallback: TimelineBlock = {
  blockType: 'timeline',
  title: 'Event timeline',
  intro: toRichText(['Timelines follow a vertical cadence—perfect for roadmaps or build retrospectives.']),
  items: [
    {
      heading: 'Starfield relaunch',
      timestamp: 'Y.Q3',
      body: toRichText(['Three.js scene upgrades and background layering shipped to production.']),
    },
    {
      heading: 'Bridge consolidation',
      timestamp: 'Y.Q4',
      body: toRichText(['Legacy routes moved into PageRenderer blocks for easier CMS control.']),
    },
  ],
};

const imageCarouselFallback: ImageCarouselBlock = {
  blockType: 'imageCarousel',
  title: 'Flight deck gallery',
  intro: toRichText([
    'Spotlight mission photography, fabrication snapshots, or archival imagery. Keep captions short to avoid crowding.',
  ]),
  slides: [
    {
      label: 'Docking rehearsal',
      imageType: 'url',
      caption: 'Navigation crew practising EVA maneuvers against the Arch hull mockup.',
      imageUrl:
        'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=1400&q=80',
      imageAlt: 'Astronaut floating above Earth tethered to a spacecraft.',
      creditLabel: 'NASA / Bill Ingalls',
      creditUrl: 'https://www.nasa.gov/',
    },
    {
      label: 'Flight plan sync',
      imageType: 'url',
      caption: 'Mission control reviews updated waypoints ahead of a long-range jump.',
      imageUrl:
        'https://images.unsplash.com/photo-1447433865958-f402f562b843?auto=format&fit=crop&w=1400&q=80',
      imageAlt: 'Crew gathered around navigation consoles inside a dimly lit bridge.',
      creditLabel: 'Astral Archives',
    },
    {
      label: 'Arch fabrication',
      imageType: 'url',
      caption: 'Hull segments staged in the shipyard before undergoing final inspections.',
      imageUrl:
        'https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=1400&q=80',
      imageAlt: 'Industrial scene with curved metal segments waiting on the deck.',
      creditLabel: 'Bridge engineering team',
    },
  ],
};

const heroEditor = createEditableBlock<HeroBlock>(heroFallback, (value) => {
  const next = {
    ...heroFallback,
    ...value,
    blockType: 'hero',
  } satisfies HeroBlock;
  next.ctas = ensureLinks(next.ctas, heroFallback.ctas ?? []);
  return next;
});

const cardGridEditor = createEditableBlock<CardGridBlock>(cardGridFallback, (value) => {
  const next = {
    ...cardGridFallback,
    ...value,
    blockType: 'cardGrid',
  } satisfies CardGridBlock;
  if (Array.isArray(next.cards)) {
    next.cards = next.cards.map((card: CardGridBlock['cards'][number]) => ({
      ...card,
      variant: card?.variant ?? 'static',
      ctas: ensureLinks(card?.ctas, []),
    }));
  } else {
    next.cards = cardGridFallback.cards;
  }
  return next;
});

const ctaListEditor = createEditableBlock<CTAListBlock>(ctaListFallback, (value) => {
  const next = {
    ...ctaListFallback,
    ...value,
    blockType: 'ctaList',
  } satisfies CTAListBlock;
  if (Array.isArray(next.items)) {
    next.items = next.items.map((item: CTAListBlock['items'][number]) => ({
      ...item,
      cta: item?.cta && item.cta.label && item.cta.href ? item.cta : undefined,
    }));
  } else {
    next.items = ctaListFallback.items;
  }
  return next;
});

const statGridEditor = createEditableBlock<StatGridBlock>(statGridFallback, (value) => {
  const next = {
    ...statGridFallback,
    ...value,
    blockType: 'statGrid',
  } satisfies StatGridBlock;
  if (!Array.isArray(next.stats)) {
    next.stats = statGridFallback.stats;
  }
  next.ctas = ensureLinks(next.ctas, statGridFallback.ctas ?? []);
  return next;
});

const timelineEditor = createEditableBlock<TimelineBlock>(timelineFallback, (value) => {
  const next = {
    ...timelineFallback,
    ...value,
    blockType: 'timeline',
  } satisfies TimelineBlock;
  if (!Array.isArray(next.items)) {
    next.items = timelineFallback.items;
  }
  return next;
});

const imageCarouselEditor = createEditableBlock<ImageCarouselBlock>(imageCarouselFallback, (value) => {
  const next = {
    ...imageCarouselFallback,
    ...value,
    blockType: 'imageCarousel',
  } satisfies ImageCarouselBlock;
  next.intro = Array.isArray(next.intro) ? next.intro : imageCarouselFallback.intro;
  if (Array.isArray(next.slides)) {
    next.slides = next.slides.filter(
      (slide: ImageCarouselBlock['slides'][number]) => slide?.imageUrl && slide?.imageAlt,
    );
    if (!next.slides.length) {
      next.slides = imageCarouselFallback.slides;
    }
  } else {
    next.slides = imageCarouselFallback.slides;
  }
  return next;
});
</script>

<style scoped>
.page-styleguide {
  gap: 3rem;
}

.styleguide-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(9, 17, 28, 0.58);
}

.styleguide-nav__link {
  font-size: 0.85rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  text-decoration: none;
  color: rgba(255, 255, 255, 0.8);
}

.styleguide-section {
  display: grid;
  gap: 1.5rem;
}

.styleguide-section__header {
  display: grid;
  gap: 0.75rem;
}

.styleguide-section__description {
  margin: 0;
  color: rgba(255, 255, 255, 0.78);
}

.styleguide-swatch-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.styleguide-swatch {
  display: grid;
  gap: 0.35rem;
  align-content: start;
  padding: 1rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
}

.styleguide-swatch__chip {
  display: inline-block;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.3);
}

.styleguide-swatch__chip--primary {
  background: linear-gradient(135deg, rgba(255, 0, 64, 0.9), rgba(255, 0, 200, 0.75));
}

.styleguide-swatch__chip--accent {
  background: linear-gradient(135deg, rgba(0, 192, 255, 0.95), rgba(106, 0, 255, 0.7));
}

.styleguide-swatch__chip--success {
  background: linear-gradient(135deg, rgba(34, 221, 0, 0.9), rgba(124, 242, 182, 0.7));
}

.styleguide-swatch__chip--surface {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.styleguide-swatch__label {
  font-size: 0.85rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
}

.styleguide-swatch__token {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.6);
}

.styleguide-typography {
  display: grid;
  gap: 1.5rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.styleguide-preview {
  display: grid;
  gap: 1.25rem;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  align-items: start;
}

.styleguide-preview__component {
  display: grid;
  gap: 1rem;
}

.styleguide-preview__editor {
  display: grid;
  gap: 0.75rem;
  padding: 1rem;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(17, 24, 39, 0.6);
}

.styleguide-preview__editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.styleguide-preview__editor-header h3 {
  margin: 0;
  font-size: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.styleguide-preview__input {
  width: 100%;
  min-height: 220px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.45);
  color: #e6f3ff;
  font-family: 'SFMono-Regular', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono',
    'Courier New', monospace;
  font-size: 0.85rem;
  line-height: 1.45;
  padding: 0.85rem;
  resize: vertical;
}

.styleguide-preview__input:focus {
  outline: 2px solid rgba(0, 192, 255, 0.7);
  outline-offset: 2px;
}

.styleguide-preview__error {
  margin-top: var(--space-xs);
}

.styleguide-cta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

@media (--bp-max-xl) {
  .styleguide-preview {
    grid-template-columns: 1fr;
  }

  .styleguide-preview__editor-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
