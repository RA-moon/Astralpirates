<template>
  <section class="container page page-profile">
    <header class="page-header">
      <h1 class="animated-title">Bridge profile</h1>
      <p class="tagline">Navigating to your bridge profile…</p>
    </header>
    <p class="loading-copy">Redirecting to your bridge profile.</p>
  </section>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from '#app';
import { useSessionStore } from '~/stores/session';

const router = useRouter();
const session = useSessionStore();

onMounted(() => {
  session.initialiseFromStorage();
  if (session.currentUser?.profileSlug) {
    router.replace('/bridge');
  } else {
    router.replace('/');
  }
});
</script>

<style scoped src="~/styles/profile-page.css"></style>
