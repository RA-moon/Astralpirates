<template>
  <section class="container page page-home">
    <header class="page-header">
      <h1 class="animated-title">Home / Bridge / Gangway pages</h1>
      <p class="tagline">
        PageShell-driven marketing pages (/, /bridge, /gangway, /gangway/about/*, /gangway/crew-quarters) reuse the same
        layout. The sample below mirrors the current CMS blocks.
      </p>
      <div class="page-header__ctas">
        <UiLinkButton to="/gangway" variant="secondary">Open the gangway</UiLinkButton>
        <UiLinkButton to="/bridge">Visit the bridge</UiLinkButton>
      </div>
    </header>

    <div class="page-grid page-grid--one">
      <PageHeroBlock :block="heroBlock as any" />
      <PageCardGridBlock :block="cardGridBlock as any" />
      <PageCTAListBlock :block="ctaListBlock as any" />
      <PageStatGridBlock :block="statGridBlock as any" />
    </div>
  </section>
</template>

<script setup lang="ts">
import type {
  CardGridBlock,
  CTAListBlock,
  HeroBlock,
  StatGridBlock,
} from '@astralpirates/shared/api-contracts';
import PageHeroBlock from '~/components/page-blocks/PageHeroBlock.vue';
import PageCardGridBlock from '~/components/page-blocks/PageCardGridBlock.vue';
import PageCTAListBlock from '~/components/page-blocks/PageCTAListBlock.vue';
import PageStatGridBlock from '~/components/page-blocks/PageStatGridBlock.vue';
import { UiLinkButton } from '~/components/ui';
import {
  sampleCardGridBlock,
  sampleCTAListBlock,
  sampleHeroBlock,
  sampleStatGridBlock,
} from '~/components/ui/demo/sampleData';

const heroBlock = sampleHeroBlock as HeroBlock;
const cardGridBlock = sampleCardGridBlock as CardGridBlock;
const ctaListBlock = sampleCTAListBlock as CTAListBlock;
const statGridBlock = sampleStatGridBlock as StatGridBlock;
</script>
