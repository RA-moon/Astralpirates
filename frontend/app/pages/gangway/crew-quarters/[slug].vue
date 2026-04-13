<template>
  <section class="container page page-profile" data-profile-root>
    <header class="page-header">
      <UiHeading :level="1">{{ heading }}</UiHeading>
      <UiText class="tagline">{{ tagline }}</UiText>
      <UiInline class="page-header__ctas" :gap="'var(--space-sm)'">
        <UiLinkButton variant="secondary" to="/gangway/crew-quarters">Back to crew quarter</UiLinkButton>
        <UiLinkButton to="/gangway">Visit the gangway</UiLinkButton>
        <UiLinkButton to="/">Return to the airlock</UiLinkButton>
      </UiInline>
    </header>

    <UiSurface v-if="isLoadingProfile && !profile" as="div" variant="card">
      <p class="loading-copy">Loading crew manifest…</p>
    </UiSurface>
    <UiSurface v-else-if="errorMessage" as="div" variant="card">
      <p class="loading-copy">{{ errorMessage }}</p>
    </UiSurface>

    <UiSurface v-else class="profile-card" data-profile-card variant="panel">
      <div class="profile-card__header">
        <CrewIdentityCard
          class="profile-card__avatar"
          data-profile-avatar
          :avatar-url="profile?.avatarUrl ?? null"
          :avatar-media-type="profile?.avatarMediaType ?? null"
          :avatar-media-url="profile?.avatarMediaUrl ?? null"
          :avatar-mime-type="profile?.avatarMimeType ?? null"
          :avatar-filename="profile?.avatarFilename ?? null"
          :call-sign="profile?.callSign"
          :display-name="profile?.callSign || profile?.profileSlug"
          :profile-slug="profile?.profileSlug ?? null"
          :role-label="roleLabel"
          size="xl"
          status="offline"
        />
        <div class="profile-card__identifiers">
          <h2 class="profile-card__call-sign">{{ profile?.callSign ?? profile?.profileSlug }}</h2>
          <p class="profile-card__meta">
            <span>{{ roleLabel }}</span>
            <span class="profile-card__bullet" aria-hidden="true">•</span>
            <span>{{ profile?.pronouns ?? '—' }}</span>
          </p>
          <p v-if="ownProfile?.email" class="profile-card__contact">
            <a :href="`mailto:${ownProfile.email}`" data-profile-email>{{ ownProfile.email }}</a>
          </p>
          <HonorBadgeList
            :badges="profile?.honorBadges ?? []"
            display-mode="inline"
            class="profile-card__badges"
          />
        </div>
        <div class="profile-card__actions" v-if="isOwn">
          <UiButton
            v-if="!editing"
            type="button"
            variant="secondary"
            @click="enterEdit"
          >
            Edit profile
          </UiButton>
          <UiButton
            v-else
            type="button"
            variant="secondary"
            @click="cancelEdit"
          >
            Cancel edit
          </UiButton>
        </div>
      </div>

      <div v-if="!editing" class="profile-card__body">
        <section class="profile-card__section profile-card__section--details">
          <h3>Profile details</h3>
          <UiStatusList
            v-if="profileDetailItems.length"
            :items="profileDetailItems"
            :item-key="(item) => item.id"
            class="profile-card__details"
          >
            <template #primary="{ item }">
              <UiText variant="caption">{{ item.label }}</UiText>
            </template>
            <template #meta="{ item }">
              <NuxtLink v-if="item.link" :to="item.link">
                {{ item.value }}
              </NuxtLink>
              <UiText v-else>{{ item.value }}</UiText>
            </template>
          </UiStatusList>
        </section>

        <section v-if="isOwn" class="profile-card__section profile-card__section--invite" data-profile-invite>
          <h3>Crew invitation</h3>
          <p class="profile-card__invite-balance">
            E.L.S.A. reserves:
            <span>{{ elsaBalance }}</span>
          </p>
          <div v-if="inviteCardLoading" class="profile-card__invite-state">
            <p>Checking enlistment status…</p>
          </div>
          <template v-else-if="hasInvite">
            <p class="profile-card__invite-summary">
              Pending enlistment for
              <strong>{{ inviteDisplayName }}</strong>
              <span v-if="inviteEmail">({{ inviteEmail }})</span>.
            </p>
            <p v-if="inviteSentAt" class="profile-card__invite-meta">Sent {{ inviteSentAt }}</p>
            <p v-if="inviteExpiry" class="profile-card__invite-meta">Expires {{ inviteExpiry }}</p>
            <p class="profile-card__invite-note">
              The enlistment link lives in your recruit’s inbox—we never display it inside the site.
            </p>
            <div class="profile-card__invite-actions">
              <UiLinkButton variant="secondary" to="/gangway/crew-quarters/enlist">
                Open enlist page
              </UiLinkButton>
              <UiButton
                type="button"
                variant="secondary"
                @click="cancelActiveInvite"
                :disabled="inviteActionBusy"
              >
                <span v-if="inviteActionBusy">Cancelling…</span>
                <span v-else>Cancel invitation</span>
              </UiButton>
            </div>
          </template>
          <template v-else>
            <p>You have no active enlistments in flight.</p>
            <p v-if="inviteRedeemedAt" class="profile-card__invite-meta">
              Last enlistment arrived {{ inviteRedeemedAt }}.
            </p>
            <div class="profile-card__invite-actions">
              <UiLinkButton variant="secondary" to="/gangway/crew-quarters/enlist">
                Enlist a friend
              </UiLinkButton>
            </div>
          </template>
          <UiAlert
            v-if="inviteCardFeedback"
            class="profile-card__invite-feedback"
            :variant="inviteCardFeedbackIsError ? 'danger' : 'success'"
            layout="inline"
          >
            {{ inviteCardFeedback }}
          </UiAlert>
        </section>

        <section
          v-if="isOwn"
          class="profile-card__section profile-card__section--flight-invites"
          data-profile-flight-invites
        >
          <h3>Flight plan invitations</h3>
          <div v-if="flightPlanInvitesLoading" class="profile-card__invite-state">
            <p>Scanning the chart for new orders…</p>
          </div>
          <div
            v-else-if="flightPlanInvitesError"
            class="profile-card__invite-state profile-card__invite-state--error"
          >
            <p>{{ flightPlanInvitesError }}</p>
          </div>
          <div v-else-if="!flightPlanInvites.length" class="profile-card__invite-state">
            <p>No pending invitations right now.</p>
          </div>
          <UiStatusList
            v-else
            :items="flightInviteStatusItems"
            class="profile-card__flight-invite-list"
          >
            <template #primary="{ item }">
              <UiText>
                <strong>{{ item.invite.flightPlan?.title ?? 'Unnamed flight plan' }}</strong>
                <span v-if="item.invite.flightPlan?.displayDate"> · {{ item.invite.flightPlan.displayDate }}</span>
              </UiText>
              <UiText v-if="item.invite.flightPlan?.location" variant="muted">
                {{ item.invite.flightPlan.location }}
              </UiText>
            </template>
            <template #meta="{ item }">
              <UiText variant="caption">
                Invited by
                <template v-if="item.invite.invitedBy?.profileSlug">
                  <NuxtLink :to="`/gangway/crew-quarters/${item.invite.invitedBy.profileSlug}`">
                    {{ item.invite.invitedBy?.callSign ?? item.invite.invitedBy?.profileSlug }}
                  </NuxtLink>
                </template>
                <span v-else>{{ item.invite.invitedBy?.callSign ?? 'Unknown crew' }}</span>
                <span v-if="item.invite.invitedAt"> · {{ item.invite.invitedAt }}</span>
              </UiText>
            </template>
            <template #actions="{ item }">
              <UiButton
                type="button"
                variant="ghost"
                @click="declineFlightPlanInvite(item.invite.membershipId)"
                :disabled="isFlightPlanInvitePending(item.invite.membershipId)"
              >
                <span v-if="isFlightPlanInvitePending(item.invite.membershipId)">Working…</span>
                <span v-else>Decline</span>
              </UiButton>
              <UiButton
                type="button"
                variant="secondary"
                @click="acceptFlightPlanInvite(item.invite.membershipId)"
                :disabled="isFlightPlanInvitePending(item.invite.membershipId)"
              >
                <span v-if="isFlightPlanInvitePending(item.invite.membershipId)">Working…</span>
                <span v-else>Accept</span>
              </UiButton>
            </template>
          </UiStatusList>
          <UiText class="profile-card__invite-hint" variant="muted">
            Accept an invitation before editing or logging missions linked to it.
          </UiText>
          <UiAlert
            v-if="flightPlanInviteFeedback"
            class="profile-card__invite-feedback"
            :variant="flightPlanInviteFeedbackIsError ? 'danger' : 'success'"
            layout="inline"
          >
            {{ flightPlanInviteFeedback }}
          </UiAlert>
        </section>

        <section class="profile-card__section" v-if="bioMarkup">
          <h3>Bio</h3>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="profile-card__bio" v-html="bioMarkup" />
        </section>

        <section class="profile-card__section" v-if="profile?.skills?.length">
          <h3>Deck skills</h3>
          <UiInline class="profile-card__chips" :gap="'var(--space-xs)'">
            <UiTag v-for="skill in profile?.skills" :key="skill.label" variant="muted">
              {{ skill.label }}
            </UiTag>
          </UiInline>
        </section>

        <section class="profile-card__section" v-if="profile?.links?.length">
          <h3>Signals</h3>
          <ul class="profile-card__links">
            <li v-for="link in profile?.links" :key="link.url">
              <a :href="link.url" target="_blank" rel="noopener">{{ link.label }}</a>
            </li>
          </ul>
        </section>
      </div>

      <form v-else class="profile-edit" @submit.prevent="submitProfile">
        <UiStack :gap="'var(--space-lg)'">
          <UiInline class="profile-edit__group" :gap="'var(--space-md)'" :wrap="true">
            <UiFormField label="Call sign">
              <template #default="{ id, describedBy }">
                <UiTextInput
                  v-model.trim="form.callSign"
                  :id="id"
                  :described-by="describedBy"
                  type="text"
                  name="callSign"
                  autocomplete="nickname"
                />
              </template>
            </UiFormField>
            <UiFormField label="Pronouns">
              <template #default="{ id, describedBy }">
                <UiTextInput
                  v-model.trim="form.pronouns"
                  :id="id"
                  :described-by="describedBy"
                  type="text"
                  name="pronouns"
                />
              </template>
            </UiFormField>
          </UiInline>

          <UiStack class="profile-edit__group profile-edit__group--avatar" :gap="'var(--space-sm)'">
            <UiFormField label="Avatar media">
              <template #default>
                <UiFileInput
                  ref="avatarInput"
                  name="avatar"
                  :accept="avatarFileAccept"
                />
              </template>
            </UiFormField>
            <UiText variant="caption" class="profile-edit__hint">
              {{ avatarUploadHint }}
            </UiText>
            <UiFormField :label="avatarTriModeEnabled ? 'Or link to avatar media' : 'Or link to an image'">
              <template #default="{ id, describedBy }">
                <UiTextInput
                  v-model.trim="form.avatarUrl"
                  :id="id"
                  :described-by="describedBy"
                  type="url"
                  name="avatarUrl"
                  placeholder="https://"
                />
              </template>
            </UiFormField>
            <UiFormField v-if="avatarTriModeEnabled" label="Linked media type">
              <template #default>
                <UiSelect
                  v-model="form.avatarMediaType"
                  :options="avatarMediaTypeOptions"
                />
              </template>
            </UiFormField>
            <UiButton type="button" variant="ghost" @click="markAvatarRemoval">
              Remove current avatar
            </UiButton>
          </UiStack>

          <UiFormField class="profile-edit__group profile-edit__group--bio" label="Bio">
            <template #default="{ id, describedBy }">
              <UiTextArea
                v-model.trim="form.bio"
                :id="id"
                :described-by="describedBy"
                rows="6"
                placeholder="Write your tale…"
              />
            </template>
          </UiFormField>
        </UiStack>
        <UiInline class="profile-edit__actions" :gap="'var(--space-sm)'">
          <UiButton type="button" variant="ghost" @click="cancelEdit" :disabled="saving">
            Cancel
          </UiButton>
          <UiButton type="submit" :disabled="saving">
            <span v-if="saving">Saving…</span>
            <span v-else>Save changes</span>
          </UiButton>
        </UiInline>
      </form>
      <UiAlert v-if="feedback" class="profile-feedback" :variant="feedbackIsError ? 'danger' : 'success'" layout="inline">
        {{ feedback }}
      </UiAlert>

      <section class="profile-card__section" data-profile-log-section>
        <LogList
          :owner-slug="profile?.profileSlug ?? null"
          title="Logbook"
          :limit="5"
          :show-composer="isOwn"
          :allow-create="mayCreateLogs"
        />
      </section>

      <section class="profile-card__section" data-profile-flight-section>
        <FlightPlanList
          :member-slug="profile?.profileSlug ?? null"
          title="Flight plans"
          :limit="5"
          empty-label="No missions yet for this crew member."
        />
      </section>
    </UiSurface>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch, onMounted } from 'vue';
import { useRoute, useRouter } from '#app';
import CrewIdentityCard from '~/components/CrewIdentityCard.vue';
import HonorBadgeList from '~/components/profile/HonorBadgeList.vue';
import LogList from '~/components/LogList.vue';
import FlightPlanList from '~/components/FlightPlanList.vue';
import { usePublicProfile, usePrivateProfile, updateOwnProfile } from '~/domains/profiles';
import { useSessionStore } from '~/stores/session';
import { CREW_ROLE_LABELS } from '@astralpirates/shared/crewRoles';
import { AVATAR_MEDIA_SOURCE_PREFIXES } from '@astralpirates/shared/mediaUrls';
import { useInviteStatus } from '~/composables/useInviteStatus';
import { useFlightPlanInvites } from '~/domains/invitations';
import { useAstralFetch } from '~/modules/api';
import { InvitationGraphSchema, type InvitationGraph } from '@astralpirates/shared/api-contracts';
import {
  AVATAR_EXTERNAL_MEDIA_TYPE_OPTIONS,
  AVATAR_FILE_ACCEPT,
  AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES,
  AVATAR_UPLOAD_MAX_FILE_SIZE_LABEL,
  normalizeAvatarMediaRecord,
  resolveAvatarUploadMimeType,
  validateAvatarUploadFile,
  type AvatarMediaType,
} from '~/modules/media/avatarMedia';
import { isAvatarTriModeEnabled } from '~/modules/featureFlags/avatarTriMode';
import {
  UiAlert,
  UiButton,
  UiFileInput,
  UiFormField,
  UiHeading,
  UiInline,
  UiLinkButton,
  UiStatusList,
  UiSurface,
  UiTag,
  UiText,
  UiTextArea,
  UiTextInput,
  UiStack,
} from '~/components/ui';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const buildProfilePath = (value: string) => `/gangway/crew-quarters/${value}`;
const SELF_PROFILE_ROUTE = '/bridge';
const LEGACY_SELF_PROFILE_ROUTE = '/gangway/cockpit';
const SELF_PROFILE_ROUTE_SET = new Set([SELF_PROFILE_ROUTE, LEGACY_SELF_PROFILE_ROUTE]);
const {
  invites: flightPlanInvites,
  isLoading: flightPlanInvitesLoading,
  error: flightPlanInvitesError,
  loadInvites: loadFlightPlanInvites,
  acceptInvite: acceptFlightInvite,
  declineInvite: declineFlightInvite,
  isMembershipPending: isFlightPlanInvitePending,
} = useFlightPlanInvites();

const flightInviteStatusItems = computed(() =>
  (flightPlanInvites.value ?? []).map((invite) => ({
    id: invite.membershipId,
    invite,
  })),
);

const normalizeSlug = (value?: string | null) => (value ?? '').trim().toLowerCase() || null;
const isSelfProfileRoute = computed(() => SELF_PROFILE_ROUTE_SET.has(route.path));
const routeSlug = computed(() => normalizeSlug(String(route.params.slug || '')));
const sessionSlug = computed(() => normalizeSlug(session.currentUser?.profileSlug ?? null));
const slug = computed(() => routeSlug.value ?? (isSelfProfileRoute.value ? sessionSlug.value ?? '' : ''));
const { data: profileData, pending, error, refresh } = usePublicProfile(() => slug.value);
const { data: ownProfileData, refresh: refreshPrivate } = usePrivateProfile();
const canonicalRedirectTo = computed(() => profileData.value?.redirectTo ?? null);
const isApplyingCanonicalRedirect = ref(false);

watch(
  canonicalRedirectTo,
  async (nextRedirect) => {
    if (!nextRedirect) return;
    const canonicalPath = buildProfilePath(nextRedirect);
    if (canonicalPath === route.path) return;

    isApplyingCanonicalRedirect.value = true;
    try {
      await router.replace({
        path: canonicalPath,
        query: route.query,
        hash: route.hash || undefined,
      });
    } finally {
      isApplyingCanonicalRedirect.value = false;
    }
  },
  { flush: 'post' },
);

watch(
  [isSelfProfileRoute, () => route.path, () => session.initialised, () => session.isAuthenticated, routeSlug, sessionSlug],
  ([selfProfileRoute, currentPath, sessionReady, authenticated, currentRouteSlug, currentSessionSlug]) => {
    if (selfProfileRoute) {
      if (!sessionReady) return;
      if (!authenticated) {
        void router.replace('/');
        return;
      }
      if (!currentSessionSlug) {
        void router.replace('/gangway');
        return;
      }
      if (currentPath !== SELF_PROFILE_ROUTE) {
        void router.replace(SELF_PROFILE_ROUTE);
      }
      return;
    }

    if (currentRouteSlug && currentSessionSlug && currentRouteSlug === currentSessionSlug) {
      void router.replace(SELF_PROFILE_ROUTE);
    }
  },
  { immediate: true },
);

const emptyGraph: InvitationGraph = { nodes: [], edges: [] };
const inviteGraphSlug = computed(() => normalizeSlug(slug.value));
const inviteGraphKey = computed(() => `invite-graph:${inviteGraphSlug.value ?? 'unknown'}`);
const {
  data: inviteGraphData,
  pending: inviteGraphPending,
  error: inviteGraphError,
} = useAstralFetch<InvitationGraph>('/api/invitations/graph', {
  key: () => inviteGraphKey.value,
  immediate: Boolean(inviteGraphSlug.value),
  watch: [inviteGraphSlug],
  query: computed(() => {
    if (!inviteGraphSlug.value) return undefined;
    return { slug: inviteGraphSlug.value };
  }),
  schema: InvitationGraphSchema,
  default: emptyGraph,
});

const profile = computed(() => profileData.value?.profile ?? null);
const ownProfile = computed(() => (isOwn.value ? ownProfileData.value ?? null : null));
const isLoadingProfile = computed(() => pending.value || isApplyingCanonicalRedirect.value);

const roleLabel = computed(() => {
  const role = profile.value?.role;
  if (role && Object.prototype.hasOwnProperty.call(CREW_ROLE_LABELS, role)) {
    return CREW_ROLE_LABELS[role as keyof typeof CREW_ROLE_LABELS];
  }
  return 'Crew';
});
const heading = computed(() => profile.value?.callSign ?? profile.value?.profileSlug ?? 'Crew profile');
const tagline = computed(() => (profile.value?.bio ? 'Crew dossier' : 'The crew profile materialises shortly.'));
const errorMessage = computed(() => error.value?.data?.error ?? error.value?.message ?? '');

const isOwn = computed(() => {
  const sessionSlugValue = sessionSlug.value;
  const routeSlugValue = routeSlug.value;
  const profileSlug = normalizeSlug(profile.value?.profileSlug ?? null);
  const ownSlug = normalizeSlug(ownProfileData.value?.profileSlug ?? null);
  if (sessionSlugValue && routeSlugValue) return sessionSlugValue === routeSlugValue;
  if (sessionSlugValue && profileSlug) return sessionSlugValue === profileSlug;
  if (ownSlug && profileSlug) return ownSlug === profileSlug;
  const ownId = ownProfileData.value?.id ?? null;
  const profileId = profile.value?.id ?? null;
  return Boolean(ownId && profileId && ownId === profileId);
});

const {
  elsaBalance,
  hasInvite,
  inviteEmail,
  inviteExpiry,
  inviteFirstName,
  inviteLastName,
  inviteSentAt,
  inviteRedeemedAt,
  isLoading: inviteStatusLoading,
  hydrateStatus: hydrateInviteStatus,
  cancelInvite: cancelInviteRequest,
} = useInviteStatus();

const inviteGraph = computed(() => inviteGraphData.value ?? emptyGraph);
const inviteGraphHasError = computed(() => Boolean(inviteGraphError.value));

const graphProfileNode = computed(() => {
  const graph = inviteGraph.value;
  const slug = profile.value?.profileSlug ?? '';
  if (!slug) return null;

  const slugMatch = graph.nodes.find((node) => node.profileSlug === slug);
  if (slugMatch) return slugMatch;

  const profileId = profile.value?.id;
  if (profileId == null) return null;

  return graph.nodes.find((node) => node.id === String(profileId)) ?? null;
});

const graphHiringEdge = computed(() => {
  const graph = inviteGraph.value;
  const node = graphProfileNode.value;
  if (!node) return null;
  return graph.edges.find((edge) => edge.target === node.id) ?? null;
});

const graphInviterNode = computed(() => {
  const graph = inviteGraph.value;
  const edge = graphHiringEdge.value;
  if (!edge) return null;
  return graph.nodes.find((node) => node.id === edge.source) ?? null;
});

const hiredBySlug = computed(() => graphInviterNode.value?.profileSlug ?? null);
const hiredByName = computed(() => {
  const inviter = graphInviterNode.value;
  if (!inviter) return null;
  return inviter.callSign?.trim() || inviter.profileSlug?.trim() || 'Unknown crew member';
});

const showHiredByRow = computed(() => Boolean(profile.value?.profileSlug));
const hiredByDisplay = computed(() => {
  if (inviteGraphPending.value) return 'Loading…';
  if (inviteGraphHasError.value) return 'Unavailable';
  return hiredByName.value ?? '—';
});

const profileDetailItems = computed(() => {
  const items: Array<{ id: string; label: string; value: string; link?: string | null }> = [];
  const own = ownProfile.value;
  if (own?.firstName) {
    items.push({ id: 'firstName', label: 'First name', value: own.firstName });
  }
  if (own?.lastName) {
    items.push({ id: 'lastName', label: 'Surname', value: own.lastName });
  }
  const slugValue = profile.value?.profileSlug;
  if (slugValue) {
    items.push({
      id: 'slug',
      label: 'Profile slug',
      value: `/gangway/crew-quarters/${slugValue}`,
      link: `/gangway/crew-quarters/${slugValue}`,
    });
  }
  if (showHiredByRow.value) {
    items.push({
      id: 'hiredBy',
      label: 'Hired by',
      value: hiredByDisplay.value,
      link: hiredBySlug.value ? `/gangway/crew-quarters/${hiredBySlug.value}` : null,
    });
  }
  return items;
});

const inviteDisplayName = computed(() => {
  const first = (inviteFirstName.value ?? '').trim();
  const last = (inviteLastName.value ?? '').trim();
  const combined = [first, last].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  if (inviteEmail.value) return inviteEmail.value;
  return 'your recruit';
});

const inviteActionBusy = ref(false);
const inviteCardFeedback = ref('');
const inviteCardFeedbackIsError = ref(false);
const inviteCardLoading = computed(() => inviteStatusLoading.value || inviteActionBusy.value);
const flightPlanInviteFeedback = ref('');
const flightPlanInviteFeedbackIsError = ref(false);

const setInviteFeedback = (message: string, isError = false) => {
  inviteCardFeedback.value = message;
  inviteCardFeedbackIsError.value = isError;
};

const setFlightPlanInviteFeedback = (message: string, isError = false) => {
  flightPlanInviteFeedback.value = message;
  flightPlanInviteFeedbackIsError.value = isError;
};

const loadInviteStatus = async (force = false) => {
  if (!isOwn.value || !session.isAuthenticated) {
    return;
  }
  const result = await hydrateInviteStatus({ silent: false, force });
  if (!result.ok) {
    setInviteFeedback(result.message, true);
  } else if (!inviteActionBusy.value) {
    setInviteFeedback('', false);
  }
};

const cancelActiveInvite = async () => {
  if (!hasInvite.value || inviteActionBusy.value) return;
  inviteActionBusy.value = true;
  setInviteFeedback('', false);
  try {
    const result = await cancelInviteRequest();
    setInviteFeedback(result.message, !result.ok);
    await loadInviteStatus(true);
  } finally {
    inviteActionBusy.value = false;
  }
};

const handleFlightPlanInviteResult = (
  result: { ok: boolean; message?: string },
  successMessage: string,
) => {
  if (result.ok) {
    setFlightPlanInviteFeedback(successMessage, false);
  } else {
    setFlightPlanInviteFeedback(result.message ?? 'Unable to update invitation.', true);
  }
};

const acceptFlightPlanInvite = async (membershipId: number) => {
  setFlightPlanInviteFeedback('', false);
  const result = await acceptFlightInvite(membershipId);
  handleFlightPlanInviteResult(result, 'Invitation accepted. The bridge awaits your input.');
  if (result.ok) {
    await loadFlightPlanInvites();
  }
};

const declineFlightPlanInvite = async (membershipId: number) => {
  setFlightPlanInviteFeedback('', false);
  const result = await declineFlightInvite(membershipId);
  handleFlightPlanInviteResult(result, 'Invitation declined. The course remains unchanged.');
  if (result.ok) {
    await loadFlightPlanInvites();
  }
};

const mayCreateLogs = computed(() => isOwn.value && session.isAuthenticated);

const editing = ref(false);
const saving = ref(false);
const feedback = ref('');
const feedbackIsError = ref(false);
const avatarInput = ref<InstanceType<typeof UiFileInput> | null>(null);
const avatarTriModeEnabled = isAvatarTriModeEnabled();
const avatarFileAccept = avatarTriModeEnabled ? AVATAR_FILE_ACCEPT : 'image/*';
const avatarUploadLimitLabel = AVATAR_UPLOAD_MAX_FILE_SIZE_LABEL;
const avatarUploadHint = avatarTriModeEnabled
  ? `Accepted formats: image, video, and 3D model files. Max size ${avatarUploadLimitLabel}.`
  : `Accepted formats: PNG, JPG, GIF, AVIF, WebP. Max size ${avatarUploadLimitLabel}.`;
const avatarMediaTypeOptions = AVATAR_EXTERNAL_MEDIA_TYPE_OPTIONS;

const resetAvatarInput = () => {
  avatarInput.value?.clear();
};

const avatarInputEl = () => {
  const exposed = avatarInput.value as any;
  if (!exposed) return null;
  const input = exposed.input;
  if (!input) return null;
  if (input instanceof HTMLInputElement) return input;
  if (input && 'value' in input) return input.value ?? null;
  return null;
};

const isInternalAvatarUrl = (value: string | null | undefined): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const path = (() => {
    try {
      return new URL(trimmed, baseOrigin).pathname;
    } catch {
      return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    }
  })();

  return AVATAR_MEDIA_SOURCE_PREFIXES.some((prefix) => path.startsWith(prefix));
};

const normalizeAvatarUrlInput = (value: string | null | undefined): string => {
  if (!value) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return isInternalAvatarUrl(trimmed) ? '' : trimmed;
};

const resolveProfileAvatarFormState = (
  source:
    | {
        avatarUrl?: string | null;
        avatarMediaType?: unknown;
        avatarMediaUrl?: string | null;
        avatarMimeType?: string | null;
        avatarFilename?: string | null;
      }
    | null
    | undefined,
) => {
  const normalized = normalizeAvatarMediaRecord({
    avatarUrl: source?.avatarUrl ?? null,
    avatarMediaType: source?.avatarMediaType,
    avatarMediaUrl: source?.avatarMediaUrl ?? null,
    avatarMimeType: source?.avatarMimeType ?? null,
    avatarFilename: source?.avatarFilename ?? null,
  });

  return {
    avatarUrl: normalizeAvatarUrlInput(normalized.avatarMediaUrl ?? normalized.avatarUrl),
    avatarMediaType: normalized.avatarMediaType,
  };
};
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toPlainBio = (value: string | null | undefined): string => {
  if (!value) return '';
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (typeof DOMParser === 'undefined') {
    return normalized;
  }
  const parser = new DOMParser();
  const documentNode = parser.parseFromString(normalized, 'text/html');
  documentNode.querySelectorAll('br').forEach((element) => {
    element.replaceWith('\n');
  });
  const plain = documentNode.body.textContent ?? '';
  return plain.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
};

const profileBioText = computed(() => toPlainBio(profile.value?.bio ?? ''));

const bioMarkup = computed(() => {
  const bio = profileBioText.value.trim();
  if (!bio) return null;
  return escapeHtml(bio).replace(/\r?\n/g, '<br />');
});

const form = reactive({
  callSign: '',
  pronouns: '',
  bio: '',
  avatarUrl: '',
  avatarMediaType: 'image' as AvatarMediaType,
  removeAvatar: false,
});

watch(
  () => profile.value,
  (next) => {
    if (next && !editing.value) {
      const avatarState = resolveProfileAvatarFormState(next);
      form.callSign = next.callSign ?? '';
      form.pronouns = next.pronouns ?? '';
      form.bio = profileBioText.value;
      form.avatarUrl = avatarState.avatarUrl;
      form.avatarMediaType = avatarTriModeEnabled ? avatarState.avatarMediaType : 'image';
      form.removeAvatar = false;
    }
  },
  { immediate: true },
);

watch(isOwn, (own) => {
  if (own) {
    loadInviteStatus(false);
    if (session.isAuthenticated) {
      loadFlightPlanInvites();
    }
  } else {
    setInviteFeedback('', false);
    setFlightPlanInviteFeedback('', false);
  }
});

watch(
  () => session.isAuthenticated,
  (authenticated) => {
    if (authenticated && isOwn.value) {
      loadInviteStatus(true);
      loadFlightPlanInvites();
    } else if (!authenticated) {
      setInviteFeedback('', false);
      setFlightPlanInviteFeedback('', false);
    }
  },
  { immediate: true },
);

const enterEdit = () => {
  editing.value = true;
  feedback.value = '';
  feedbackIsError.value = false;
  if (!ownProfile.value) {
    refreshPrivate();
  }
};

const cancelEdit = () => {
  editing.value = false;
  feedback.value = '';
  feedbackIsError.value = false;
  form.removeAvatar = false;
  resetAvatarInput();
  if (profile.value) {
    const avatarState = resolveProfileAvatarFormState(profile.value);
    form.callSign = profile.value.callSign ?? '';
    form.pronouns = profile.value.pronouns ?? '';
    form.bio = profileBioText.value;
    form.avatarUrl = avatarState.avatarUrl;
    form.avatarMediaType = avatarTriModeEnabled ? avatarState.avatarMediaType : 'image';
  } else {
    form.avatarMediaType = 'image';
  }
};

const markAvatarRemoval = () => {
  form.removeAvatar = true;
  form.avatarUrl = '';
  form.avatarMediaType = 'image';
  resetAvatarInput();
};

const submitProfile = async () => {
  if (!isOwn.value) return;
  saving.value = true;
  feedback.value = '';
  feedbackIsError.value = false;

  try {
    const payload = new FormData();
    payload.set('callSign', form.callSign);
    payload.set('pronouns', form.pronouns);
    payload.set('bio', form.bio);
    if (form.avatarUrl) {
      payload.set('avatarUrl', form.avatarUrl);
      if (avatarTriModeEnabled) {
        payload.set('avatarMediaType', form.avatarMediaType);
      }
    }
    const inputEl = avatarInputEl();
    const selectedAvatar = avatarInput.value?.files?.[0] ?? inputEl?.files?.[0] ?? null;
    if (selectedAvatar) {
      if (avatarTriModeEnabled) {
        const uploadValidation = validateAvatarUploadFile(selectedAvatar);
        if (!uploadValidation.ok) {
          throw new Error(uploadValidation.error);
        }
      } else {
        if (selectedAvatar.size > AVATAR_UPLOAD_MAX_FILE_SIZE_BYTES) {
          throw new Error(`Avatar exceeds the ${AVATAR_UPLOAD_MAX_FILE_SIZE_LABEL} limit.`);
        }
        const uploadMimeType = resolveAvatarUploadMimeType(selectedAvatar);
        if (!uploadMimeType || !uploadMimeType.startsWith('image/')) {
          throw new Error('Unsupported avatar format. Upload PNG, JPG, GIF, AVIF, or WebP.');
        }
      }
      payload.set('avatar', selectedAvatar);
    }
    const hasPendingAvatarRemoval = form.removeAvatar && !(avatarInput.value?.files?.length || inputEl?.files?.length);
    if (hasPendingAvatarRemoval) {
      payload.set('avatarAction', 'remove');
    }

    await updateOwnProfile(payload);
    feedback.value = 'Profile updated successfully.';
    feedbackIsError.value = false;
    editing.value = false;
    const refreshTasks = [refreshPrivate(), session.refresh()];

    await router.replace(SELF_PROFILE_ROUTE);
    await Promise.all([refresh(), ...refreshTasks]);
  } catch (err: any) {
    feedback.value = err?.statusMessage || err?.data?.error || err?.message || 'Failed to update profile.';
    feedbackIsError.value = true;
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  if (isOwn.value) {
    loadInviteStatus(false);
    if (session.isAuthenticated) {
      loadFlightPlanInvites();
    }
  }
});
</script>

<style scoped src="~/styles/profile-page.css"></style>
