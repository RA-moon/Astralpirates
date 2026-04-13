<template>
  <section class="container page page-profile">
    <article class="profile-card" data-profile-card>
      <div class="profile-card__header">
        <CrewIdentityCard
          class="profile-card__avatar"
          :avatar-url="profile.avatarUrl"
          :call-sign="profile.callSign"
          :display-name="profile.displayName"
          :profile-slug="profile.profileSlug"
          :role-label="profile.roleLabel"
          size="xl"
          status="offline"
        />
        <div class="profile-card__identifiers">
          <h2 class="profile-card__call-sign">{{ profile.callSign }}</h2>
          <p class="profile-card__meta">
            <span>{{ profile.roleLabel }}</span>
            <span class="profile-card__bullet" aria-hidden="true">•</span>
            <span>{{ profile.pronouns }}</span>
          </p>
          <p class="profile-card__contact">
            <a href="mailto:nova@astralpirates.com">{{ profile.email }}</a>
          </p>
        </div>
        <div class="profile-card__actions">
          <UiButton type="button" variant="secondary" disabled>Edit profile</UiButton>
        </div>
      </div>

      <div class="profile-card__body">
        <section class="profile-card__section profile-card__section--details">
          <h3>Profile details</h3>
          <dl class="profile-card__details">
            <div>
              <dt>Profile slug</dt>
              <dd>/gangway/crew-quarters/{{ profile.profileSlug }}</dd>
            </div>
            <div>
              <dt>Hired by</dt>
              <dd>Vector</dd>
            </div>
          </dl>
        </section>

        <section class="profile-card__section profile-card__section--invite">
          <h3>Crew invitation</h3>
          <p class="profile-card__invite-summary">
            Pending enlistment for <strong>Signal</strong> (signal@astralpirates.com).
          </p>
          <p class="profile-card__invite-note">
            The enlistment link was emailed directly to your recruit—we never display it on the site.
          </p>
          <p class="profile-card__invite-recipient">Sent Apr 20 · Expires Apr 27</p>
        </section>

        <section class="profile-card__section profile-card__section--flight-invites">
          <h3>Flight plan invitations</h3>
          <ul class="profile-card__flight-invite-list">
            <li class="profile-card__flight-invite">
              <div class="profile-card__flight-invite-copy">
                <p class="profile-card__flight-invite-title">
                  <strong>Midnight maintenance window</strong>
                  <span> · Apr 26</span>
                </p>
                <p class="profile-card__flight-invite-meta">
                  Invited by Nova · Apr 20
                </p>
              </div>
              <div class="profile-card__flight-invite-actions">
                <UiButton type="button" variant="secondary" disabled>Decline</UiButton>
                <UiButton type="button" disabled>Accept invite</UiButton>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import CrewIdentityCard from '~/components/CrewIdentityCard.vue';
import { UiButton } from '~/components/ui';

const profile = {
  callSign: 'Nova',
  displayName: 'Nova',
  avatarUrl: 'https://images.unsplash.com/photo-1504593811423-6dd665756598?auto=format&fit=facearea&w=200&h=200&q=80',
  profileSlug: 'nova',
  roleLabel: 'Captain',
  pronouns: 'she/her',
  email: 'nova@astralpirates.com',
};
</script>

<style scoped src="~/styles/profile-page.css"></style>
