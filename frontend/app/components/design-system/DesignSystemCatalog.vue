<template>
  <section class="design-system container">
    <header class="design-system__intro">
      <UiHeading :level="1">Design system</UiHeading>
      <UiText>
        Interactive component playground powered entirely by local sample data. Nothing on this page touches the CMS
        or any database records, so feel free to experiment.
      </UiText>
      <UiText variant="muted">
        Use the nav to jump between component families. Each card renders a small demo component defined in
        <code>components/ui/demo</code>.
      </UiText>
    </header>

    <nav class="design-system__nav" aria-label="Component sections">
      <a v-for="category in categories" :key="category.id" :href="`#${category.id}`">
        {{ category.title }}
      </a>
    </nav>

    <nav class="design-system__nav design-system__nav--demos" aria-label="Demo pages">
      <NuxtLink
        v-for="demo in demoLinks"
        :key="demo.id"
        class="design-system__nav-link"
        :to="`/design-system/${demo.id}`"
      >
        {{ demo.name }}
      </NuxtLink>
    </nav>

    <UiDivider />

    <section
      v-for="category in categories"
      :id="category.id"
      :key="category.id"
      class="design-system__section"
    >
      <header class="design-system__section-header">
        <UiHeading :level="2">{{ category.title }}</UiHeading>
        <UiText variant="muted">{{ category.description }}</UiText>
      </header>

      <div class="design-system__demo-grid">
        <article v-for="demo in category.demos" :key="demo.id" class="design-system__demo-card">
          <header class="design-system__demo-header">
            <UiHeading :level="4" size="h4" :uppercase="false">{{ demo.name }}</UiHeading>
            <UiText variant="muted">{{ demo.description }}</UiText>
          </header>
          <Suspense>
            <component :is="demo.component" v-bind="demo.props" />
            <template #fallback>
              <UiText variant="caption">Loading demo…</UiText>
            </template>
          </Suspense>
        </article>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { uiDemoRegistry } from '~/components/ui/demo/registry';
import { UiDivider, UiHeading, UiText } from '~/components/ui';

const categories = uiDemoRegistry;
const demoLinks = categories.flatMap((category) =>
  category.demos.map((demo) => ({
    id: demo.id,
    name: demo.name,
  })),
);
</script>

<style scoped>
.design-system {
  --design-system-border-width: var(--size-base-layout-px);
  --design-system-nav-font-size: calc(var(--size-base-space-rem) * 0.85);
  --design-system-nav-letter-spacing: var(--crew-identity-meta-letter-spacing);
  --design-system-nav-padding-block: calc(var(--size-base-space-rem) * 0.3);
  --design-system-nav-padding-inline: calc(var(--size-base-space-rem) * 0.6);
  --design-system-demo-link-font-size: calc(var(--size-base-space-rem) * 0.8);
  --design-system-demo-link-padding-block: var(--space-2xs);
  --design-system-demo-link-padding-inline: var(--space-sm);
  --design-system-demo-grid-min-column: calc(var(--size-base-layout-px) * 280);

  display: flex;
  flex-direction: column;
  gap: var(--space-xl);
  padding-bottom: var(--space-2xl);
}

.design-system__intro {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.design-system__nav {
  position: sticky;
  top: calc(var(--space-md));
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
  background: rgba(0, 0, 0, 0.4);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  border: var(--design-system-border-width) solid var(--color-border-panel);
}

.design-system__nav a {
  color: var(--color-text-primary);
  text-decoration: none;
  font-size: var(--design-system-nav-font-size);
  letter-spacing: var(--design-system-nav-letter-spacing);
  text-transform: uppercase;
  padding: var(--design-system-nav-padding-block) var(--design-system-nav-padding-inline);
  border-radius: var(--radius-pill);
  border: var(--design-system-border-width) solid transparent;
}

.design-system__nav a:hover,
.design-system__nav a:focus-visible {
  border-color: var(--color-border-panel);
}

.design-system__nav--demos {
  position: static;
  background: transparent;
  border-color: transparent;
  padding: 0;
  gap: var(--space-xs);
}

.design-system__nav-link {
  color: var(--color-accent-secondary);
  text-decoration: none;
  font-size: var(--design-system-demo-link-font-size);
  letter-spacing: var(--design-system-nav-letter-spacing);
  text-transform: uppercase;
  border: var(--design-system-border-width) solid var(--color-border-panel);
  border-radius: var(--radius-pill);
  padding: var(--design-system-demo-link-padding-block) var(--design-system-demo-link-padding-inline);
}

.design-system__nav-link:hover,
.design-system__nav-link:focus-visible {
  border-color: var(--color-button-border-hover);
  background: rgba(255, 255, 255, 0.08);
}

.design-system__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.design-system__section-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.design-system__demo-grid {
  display: grid;
  gap: var(--space-lg);
  grid-template-columns: repeat(auto-fit, minmax(var(--design-system-demo-grid-min-column), 1fr));
}

.design-system__demo-card {
  padding: var(--space-md);
  border-radius: var(--radius-lg);
  border: var(--design-system-border-width) solid var(--color-border-panel);
  background: var(--color-surface-panel);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.design-system__section#page-clones .design-system__demo-grid {
  grid-template-columns: 1fr;
}
.design-system__demo-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

:global(.dark-mode) .design-system__nav {
  background: rgba(0, 0, 0, 0.6);
}
</style>
