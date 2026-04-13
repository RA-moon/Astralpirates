<template>
  <section class="container page page-enlist">
    <header class="page-header">
      <h1 class="animated-title">Enlist a friend</h1>
      <p class="tagline">Spend one E.L.S.A. to invite a new pirate aboard.</p>
    </header>

    <article class="profile-card profile-card--enlist">
      <p class="profile-card__invite-balance profile-card__invite-balance--large">
        E.L.S.A. reserves:
        <span>2</span>
      </p>

      <form class="enlist-form">
        <fieldset>
          <legend class="visually-hidden">Invite details</legend>
          <div class="enlist-form__grid">
            <label>
              Name
              <input type="text" value="Signal" readonly />
            </label>
            <label>
              Surname
              <input type="text" value="Boost" readonly />
            </label>
            <label class="enlist-form__email">
              Email
              <input type="email" value="signal@astralpirates.com" readonly />
            </label>
          </div>
        </fieldset>
        <p class="enlist-form__note">
          Submitting will spend one E.L.S.A. from your balance.
        </p>
        <div class="enlist-form__actions">
          <UiButton type="button" disabled>Enlist</UiButton>
          <UiButton type="button" variant="secondary" disabled>Reset</UiButton>
        </div>
      </form>
    </article>
  </section>
</template>

<script setup lang="ts">
import { UiButton } from '~/components/ui';

// pure presentational demo
</script>

<style scoped src="~/styles/profile-page.css"></style>
