<template>
  <footer class="site-footer" aria-label="Site navigation">
    <nav class="site-footer__nav">
      <NuxtLink
        v-for="link in footerLinks"
        :key="link.id"
        :to="link.href"
        class="site-footer__link"
        rel="nofollow"
      >
        {{ link.label }}
      </NuxtLink>
    </nav>
    <div class="site-footer__legal">
      <a
        v-for="link in legalLinks"
        :key="link.id"
        :href="link.href"
        class="site-footer__link"
        target="_blank"
        rel="noopener nofollow"
      >
        {{ link.label }}
      </a>
    </div>
    <div class="site-footer__ops">
      <NuxtLink to="/status" class="site-footer__link" rel="nofollow">
        Ship status
      </NuxtLink>
    </div>
    <p class="site-footer__note">© {{ currentYear }} Astral Pirates · Navigation auto-generated from site schema.</p>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { createNavigationLinks, type NavigationOverrides } from '~/utils/siteMenu';

const props = defineProps<{ overrides?: NavigationOverrides }>();

const footerLinks = computed(() => createNavigationLinks({ includeSecondary: false, overrides: props.overrides }));
const legalLinks = [
  { id: 'terms-privacy', label: 'Terms & Privacy', href: '/legal/Astralpirates_Terms_Privacy.pdf' },
];
const currentYear = computed(() => new Date().getUTCFullYear());
</script>

<style scoped>
.site-footer {
  --site-footer-margin-top-min: var(--space-xl);
  --site-footer-margin-top-fluid: calc(var(--size-base-space-rem) * 5);
  --site-footer-margin-top-max: var(--space-2xl);
  --site-footer-padding-top-min: var(--space-lg);
  --site-footer-padding-top-fluid: calc(var(--size-base-space-rem) * 4);
  --site-footer-padding-top-max: var(--space-xl);
  --site-footer-border-width: var(--size-base-layout-px);
  --site-footer-row-gap: var(--space-sm);
  --site-footer-column-gap: var(--space-lg);
  --site-footer-link-size: calc(var(--size-base-space-rem) * 0.85);
  --site-footer-note-size: var(--space-sm);
  --site-footer-note-letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 0.625);

  margin-top: clamp(
    var(--site-footer-margin-top-min),
    var(--site-footer-margin-top-fluid),
    var(--site-footer-margin-top-max)
  );
  padding-top: clamp(
    var(--site-footer-padding-top-min),
    var(--site-footer-padding-top-fluid),
    var(--site-footer-padding-top-max)
  );
  border-top: var(--site-footer-border-width) solid var(--color-border-weak);
  display: grid;
  gap: var(--site-footer-row-gap);
}

.site-footer__nav {
  display: flex;
  flex-wrap: wrap;
  gap: var(--site-footer-row-gap) var(--site-footer-column-gap);
}

.site-footer__legal {
  display: flex;
  flex-wrap: wrap;
  gap: var(--site-footer-row-gap) var(--site-footer-column-gap);
}

.site-footer__ops {
  display: flex;
  flex-wrap: wrap;
  gap: var(--site-footer-row-gap) var(--site-footer-column-gap);
}

.site-footer__link {
  font-size: var(--site-footer-link-size);
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  text-transform: uppercase;
  text-decoration: none;
  color: var(--color-text-secondary);
}

.site-footer__link:hover,
.site-footer__link:focus-visible {
  color: var(--color-text-primary);
}

.site-footer__note {
  font-size: var(--site-footer-note-size);
  color: var(--color-text-muted);
  letter-spacing: var(--site-footer-note-letter-spacing);
  text-transform: uppercase;
}
</style>
