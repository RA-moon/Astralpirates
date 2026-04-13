<template>
  <UiImageCarousel :slides="slides" />
</template>

<script setup lang="ts">
import { UiImageCarousel } from '~/components/ui';
import { sampleCarouselSlides } from '~/components/ui/demo/sampleData';

const slides = sampleCarouselSlides;
</script>
