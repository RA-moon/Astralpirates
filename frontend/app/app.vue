<script setup lang="ts">
import { onNuxtReady, useHead } from '#app';

const hydrationInlineScript = `(function(){var mark=function(){window.__ASTRAL_HYDRATED__=true;document.documentElement.dataset.astralHydrated='true';};if(document.readyState==='complete'||document.readyState==='interactive'){setTimeout(mark,0);}else{window.addEventListener('DOMContentLoaded',mark,{once:true});}})();`;

useHead({
  script: [
    {
      key: 'astral-hydration-flag',
      innerHTML: hydrationInlineScript,
      tagPosition: 'bodyClose',
    },
  ],
  __dangerouslyDisableSanitizersByTagID: {
    'astral-hydration-flag': ['innerHTML'],
  },
});

if (import.meta.client) {
  const markHydrated = () => {
    window.__ASTRAL_HYDRATED__ = true;
    document.documentElement.dataset.astralHydrated = 'true';
  };

  const markNuxtReady = () => {
    (window as any).__ASTRAL_NUXT_READY__ = true;
    document.documentElement.dataset.astralNuxtReady = 'true';
  };

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    requestAnimationFrame(markHydrated);
  } else {
    window.addEventListener('DOMContentLoaded', () => markHydrated(), { once: true });
  }

  onNuxtReady(() => {
    markHydrated();
    markNuxtReady();
  });
}
</script>

<template>
  <NuxtLayout>
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
@import '~/styles/utilities.css';
@import '~/styles/tokens.css';
@import '~/styles/profile-page.css';
@import '~/styles/site-menu.css';
*{box-sizing:border-box}
html,body{height:100%}
body{
  margin:0;
  font-family:var(--font-family-body);
  color:var(--color-text-primary);
  background:var(--color-background-base);
  overflow-x:hidden;
}

:where(body, body *){
  --font-top-padding-local:calc(var(--font-top-padding) * 1em);
}

:where(body, p, h1, h2, h3, h4, h5, h6, li, blockquote, dt, dd, label, button, input, textarea, a, span, small, strong, em, b, i, mark, time, figcaption, caption, th, td){
  padding-block-start:var(--font-top-padding-local);
}

[hidden]{ display:none !important; }

.skip-link{ position:absolute; left:-9999px; top:auto; width:1px; height:1px; overflow:hidden; }
.skip-link:focus{ position:fixed; left:1rem; top:1rem; width:auto; height:auto; background:var(--color-surface-overlay); color:var(--color-text-primary); padding:.5rem .75rem; z-index:2000; }

.container{ max-width:960px; margin:0 auto; padding:1rem; }

.content-panel{
  --content-panel-fade-padding-base: calc(var(--size-avatar-sm) * 2);
  --content-panel-fade-padding: calc(var(--content-panel-fade-padding-base) * 1.5);

  position:relative;
  z-index:1;
  height:100vh;
  height:100svh;
  overflow:auto;
  padding-block:var(--content-panel-fade-padding);
  padding-inline:0;
  top:0;
  margin-inline-start:calc(var(--icon-size-px, 32px) * 2.5);
  margin-inline-end:calc(var(--icon-size-px, 32px) * 2.5);
  background:transparent;
  -webkit-overflow-scrolling:touch;
  backdrop-filter:blur(var(--content-panel-blur));
  -webkit-backdrop-filter:blur(var(--content-panel-blur));
  -webkit-mask-image:linear-gradient(
    to bottom,
    rgba(0,0,0,0) 0,
    rgba(0,0,0,0) var(--clip-top),
    rgba(0,0,0,1) calc(var(--clip-top) + var(--fade-size)),
    rgba(0,0,0,1) calc(100% - (var(--clip-bottom) + var(--fade-size))),
    rgba(0,0,0,0) calc(100% - var(--clip-bottom)),
    rgba(0,0,0,0) 100%
  );
  mask-image:linear-gradient(
    to bottom,
    rgba(0,0,0,0) 0,
    rgba(0,0,0,0) var(--clip-top),
    rgba(0,0,0,1) calc(var(--clip-top) + var(--fade-size)),
    rgba(0,0,0,1) calc(100% - (var(--clip-bottom) + var(--fade-size))),
    rgba(0,0,0,0) calc(100% - var(--clip-bottom)),
    rgba(0,0,0,0) 100%
  );
  -webkit-mask-mode:alpha;
  mask-mode:alpha;
  -webkit-mask-repeat:no-repeat;
  mask-repeat:no-repeat;
  scrollbar-width:none;
}

.content-panel::-webkit-scrollbar{ display:none; }

@supports not (mask-image:linear-gradient(black,black)){
  .content-panel{
    padding-block-start:calc(var(--clip-top) + var(--fade-size) + var(--content-panel-fade-padding));
    padding-block-end:calc(var(--clip-bottom) + var(--fade-size) + var(--content-panel-fade-padding));
  }
}

.content-panel::before{
  content:"";
  position:absolute;
  inset:0;
  border-radius:inherit;
  pointer-events:none;
  background:radial-gradient(120% 120% at 50% 20%, rgba(255,255,255,.22), rgba(255,255,255,.06) 55%, rgba(255,255,255,0));
  opacity:.55;
  z-index:0;
}

.content-panel > *{
  position:relative;
  z-index:1;
}

.content-panel:focus-visible{ outline:2px solid var(--color-border-contrast); outline-offset:6px; }

.content-panel h1,
.content-panel h2,
.content-panel h3{
  font-weight:600;
  letter-spacing:.05em;
  text-transform:uppercase;
}

:where(h1){
  font-size:var(--heading-size-h1);
}

:where(h2){
  font-size:var(--heading-size-h2);
}

:where(h3){
  font-size:var(--heading-size-h3);
}

:where(h4){
  font-size:var(--heading-size-h4);
}

:where(h5){
  font-size:var(--heading-size-h5);
}

:where(h6){
  font-size:var(--heading-size-h6);
}

:where(h1,h2,h3,h4,h5,h6,[id]){
  scroll-margin-top:calc(var(--clip-top) + var(--fade-size));
}

.animated-title{
  display:inline-block;
  background:var(--gradient-rainbow);
  background-size:200% 100%;
  background-position:0 0;
  background-clip:text;
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  color:transparent;
  animation:rainbow-slide 12s linear infinite;
  will-change:background-position;
}

.animated-title--reverse,
h2.animated-title{
  animation-direction:reverse;
}

@keyframes rainbow-slide{
  to{ background-position:200% 0; }
}

@media (prefers-reduced-motion: reduce){
  .animated-title{
    animation:none;
    background-position:50% 0;
    -webkit-text-fill-color:currentColor;
    color:inherit;
  }
}

.content-panel p{
  line-height:1.7;
  margin-bottom:1.25rem;
}

.content-panel ul,
.content-panel ol{
  margin:0 0 1.5rem 1.5rem;
  line-height:1.6;
}

.visually-hidden{
  position:absolute;
  width:1px;
  height:1px;
  padding:0;
  margin:-1px;
  overflow:hidden;
  clip:rect(0,0,0,0);
  white-space:nowrap;
  border:0;
}

.loading-copy{
  font-style:italic;
  opacity:.7;
}

.page{ display:flex; flex-direction:column; gap:2.5rem; }
.page-header{ display:flex; flex-direction:column; gap:1rem; }
.tagline{ font-size:1.1rem; max-width:none; }

.cta-group{ display:flex; flex-wrap:wrap; gap:.75rem; }
/* Align log entry navigation buttons to page edges */
.page-log-entry .cta-group{ width:100%; }
.page-log-entry .cta-group .log-entry-nav-next{ margin-left:auto; }
.page-grid{ display:grid; gap:1.75rem; }
.page-grid--one{ grid-template-columns:1fr; }
.page-grid--two{ grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); }
.page-home .page-grid--two{ grid-template-columns:1fr; }
.page-grid--three{ grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); }
.page-bridge .page-card-grid .card--variant-flightPlans,
.page-bridge .page-card-grid .card--variant-logs{
  grid-column:1 / -1;
}

.page-block__header{ margin-bottom:1.5rem; }
.page-block__intro{
  margin-bottom:1.75rem;
  color:var(--color-text-secondary);
}

.page-fallback{
  color:var(--color-text-muted);
  text-align:center;
  padding:2rem 0;
}

/* removed conflicting canvas#AstralSpace fixed/z-index; controlled by background.css */

@media (--bp-max-compact){
  .content-panel{
    width:calc(100% - var(--space-lg));
    top:0;
    height:100svh;
    margin:0 auto;
    padding-block:var(--content-panel-fade-padding);
    padding-inline:var(--space-lg);
  }
  .cta-group{ flex-direction:column; }
  :deep(.ui-button),
  :deep(.ui-link-button){
    width:100%;
    justify-content:center;
  }
  .page-log-entry .cta-group{ align-items:stretch; }
  .page-log-entry .cta-group :deep(.ui-link-button){ width:auto; }
  .page-log-entry .cta-group .log-entry-nav-prev{ align-self:flex-start; }
  .page-log-entry .cta-group .log-entry-nav-next{ align-self:flex-end; }
}
</style>
