<template>
  <section class="container page page-enlist-accept">
    <header class="page-header">
      <h1 class="animated-title">Join the crew</h1>
      <p class="tagline">Complete your enlistment by choosing a call sign and password.</p>
    </header>

    <UiSurface as="article" variant="card" class="enlist-accept-card">
      <p class="enlist-accept-helper enlist-accept-note">
        Invitation issued to <strong>signal@astralpirates.com</strong>. Enter the same details below so we can confirm
        this enlistment.
      </p>

      <form class="enlist-accept-form">
        <fieldset class="enlist-accept-fieldset">
          <legend class="visually-hidden">Invitation details</legend>
          <div class="enlist-accept-grid">
            <label>
              Email
              <input type="email" value="signal@astralpirates.com" readonly />
            </label>
            <label>
              Name
              <input type="text" value="Signal" readonly />
            </label>
            <label>
              Surname
              <input type="text" value="Boost" readonly />
            </label>
          </div>
        </fieldset>

        <fieldset class="enlist-accept-fieldset">
          <legend class="visually-hidden">Crew identity</legend>
          <label class="enlist-accept-callsign">
            Call sign
            <input type="text" value="Comet" readonly />
          </label>
          <p class="enlist-accept-helper enlist-accept-helper--success">
            Call sign is available.
            <span class="enlist-accept-helper-suggestion">Try “Comet-7”</span>
          </p>
        </fieldset>

        <fieldset class="enlist-accept-fieldset enlist-accept-fieldset--passwords">
          <legend class="visually-hidden">Password</legend>
          <label>
            Password
            <input type="password" value="••••••••" readonly />
          </label>
          <label>
            Confirm password
            <input type="password" value="••••••••" readonly />
          </label>
        </fieldset>

        <div class="enlist-accept-actions">
          <UiButton type="button" disabled>Join the crew</UiButton>
        </div>
      </form>
    </UiSurface>
  </section>
</template>

<script setup lang="ts">
import { UiButton, UiSurface } from '~/components/ui';

// purely static demo
</script>

<style scoped>
.enlist-accept-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.enlist-accept-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
}

.enlist-accept-fieldset {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.enlist-accept-fieldset--passwords {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.enlist-accept-callsign {
  display: grid;
  gap: 0.5rem;
}

.enlist-accept-helper {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.75);
}

.enlist-accept-helper--success {
  color: #7cf2b6;
}

.enlist-accept-helper-suggestion {
  display: inline-block;
  margin-left: 0.5rem;
  color: rgba(255, 255, 255, 0.85);
}

.enlist-accept-form label {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.7);
}

.enlist-accept-form input {
  padding: 0.65rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: inherit;
  font: inherit;
}

.enlist-accept-actions {
  display: flex;
  justify-content: flex-end;
}
</style>
