<template>
  <nav class="ui-breadcrumb" aria-label="Breadcrumb">
    <ol>
      <li v-for="(item, index) in items" :key="item.label">
        <NuxtLink v-if="item.href && index < items.length - 1" :to="item.href">{{ item.label }}</NuxtLink>
        <span v-else aria-current="page">{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
defineProps<{
  items: { label: string; href?: string }[];
}>();
</script>

<style scoped>
.ui-breadcrumb {
  --ui-breadcrumb-gap: var(--space-xs);
  --ui-breadcrumb-font-size: calc(var(--size-base-space-rem) * 0.85 * var(--size-scale-factor));
}

.ui-breadcrumb ol {
  list-style: none;
  display: flex;
  gap: var(--ui-breadcrumb-gap);
  margin: 0;
  padding: 0;
  color: var(--color-text-meta);
  text-transform: uppercase;
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  font-size: var(--ui-breadcrumb-font-size);
}

.ui-breadcrumb li + li:before {
  content: '/';
  margin-right: var(--ui-breadcrumb-gap);
  color: var(--color-text-caption);
}

.ui-breadcrumb a {
  color: var(--color-accent-secondary);
  text-decoration: none;
}
</style>
