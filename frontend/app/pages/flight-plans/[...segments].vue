<template>
  <section class="container page page-flight-plan">
    <ClientOnly>
      <PrivilegedControlsFlyout :page-data="null" :has-extra-controls="canEditMission">
        <template v-if="canEditMission" #extra-actions>
          <UiButton variant="secondary" type="button" @click="toggleEditForm">
            {{ showEditForm ? 'Close mission editor' : 'Edit mission' }}
          </UiButton>
        </template>
      </PrivilegedControlsFlyout>
    </ClientOnly>

    <UiSurface v-if="pending" class="flight-plan__state" variant="panel" role="status">
      <UiText>Loading flight plan…</UiText>
    </UiSurface>

    <UiSurface v-else-if="errorMessage" class="flight-plan__state" variant="panel">
      <UiText>{{ errorMessage }}</UiText>
      <UiInline :gap="'var(--space-sm)'">
        <UiButton
          v-if="errorStatus === 401"
          variant="primary"
          type="button"
          @click="openAuthDialog"
        >
          Embark to view mission
        </UiButton>
        <UiLinkButton variant="secondary" to="/bridge/flight-plans">Back to flight plans</UiLinkButton>
      </UiInline>
    </UiSurface>

    <UiStack v-else :gap="'var(--space-xl)'">
      <UiSurface variant="panel" class="flight-plan__header-card">
        <UiText variant="eyebrow">Flight plans</UiText>
        <UiHeading :level="1">{{ plan?.title }}</UiHeading>
        <UiTag v-if="planCategory" size="sm" variant="muted" class="flight-plan__category">
          {{ planCategory === 'test' ? 'Test' : planCategory === 'event' ? 'Event' : 'Project' }}
        </UiTag>
        <UiInline v-if="plan" class="flight-plan__status-row" :gap="'var(--space-xs)'">
          <UiTag size="sm">{{ planStatusLabel }}</UiTag>
          <UiTag size="sm" variant="muted">{{ planStatusBucketLabel }}</UiTag>
        </UiInline>
        <UiText v-if="metaLine" class="flight-plan__meta">{{ metaLine }}</UiText>
        <UiText v-else-if="plan?.summary" class="flight-plan__meta">
          {{ plan.summary }}
        </UiText>
        <UiInline v-if="canDeleteMission" class="flight-plan__actions" :gap="'var(--space-sm)'">
          <UiButton
            variant="destructive"
            type="button"
            :loading="deleteSubmitting"
            @click="handleDelete"
          >
            Delete mission
          </UiButton>
        </UiInline>
        <UiAlert
          v-if="deleteFeedback"
          :variant="deleteFeedbackIsError ? 'danger' : 'success'"
          layout="inline"
        >
          {{ deleteFeedback }}
        </UiAlert>
      </UiSurface>

      <UiSurface
        v-if="plan"
        variant="panel"
        class="flight-plan__lifecycle-panel"
      >
        <FlightPlanLifecycleControls
          :plan="plan"
          :can-manage="canManageLifecycle"
          :busy="lifecycleSubmitting"
          @transition="handleStatusTransition"
          @reopen="handleReopen"
          @create-iteration="handleCreateIteration"
        />
        <UiAlert
          v-if="lifecycleFeedback"
          :variant="lifecycleFeedbackIsError ? 'danger' : 'success'"
          layout="inline"
        >
          {{ lifecycleFeedback }}
        </UiAlert>
      </UiSurface>

      <UiSurface
        v-if="canEditMission && showEditForm"
        variant="panel"
        class="flight-plan__edit-panel"
      >
        <FlightPlanForm
          v-if="editInitialValues"
          ref="editFormRef"
          :initial-values="editInitialValues"
          :submitting="editSubmitting"
          submit-label="Save mission"
          :show-reset="false"
          :show-gallery-editor="false"
          :allow-gallery-editing="canEditMission"
          :flight-plan-id="plan?.id ?? null"
          :flight-plan-slug="flightPlanSlug"
          @submit="handleEditSubmit"
          @reset="resetEditFeedback"
        />
        <UiText v-else variant="muted">Preparing mission editor…</UiText>
        <UiAlert
          v-if="editFeedback"
          :variant="editFeedbackIsError ? 'danger' : 'success'"
          layout="inline"
        >
          {{ editFeedback }}
        </UiAlert>
      </UiSurface>

      <UiSurface
        v-if="canEditMission"
        variant="panel"
        class="flight-plan__edit-panel"
      >
        <FlightPlanGalleryEditor
          v-model="galleryEditorSlides"
          :disabled="!canEditMission"
          readonly-help="Only captains and crew organisers can edit the mission gallery."
          :flight-plan-id="plan?.id ?? null"
          :flight-plan-slug="flightPlanSlug"
          :base-revision="planRevision"
        />
      </UiSurface>

      <FlightPlanGallerySection
        :slides="plan?.gallerySlides ?? []"
        :can-edit="canEditMission"
      />

      <UiSurface v-if="plan?.body?.length || plan?.summary" variant="panel" class="flight-plan__body">
        <RichTextRenderer v-if="plan?.body?.length" :content="plan.body" />
        <UiText v-else>
          {{ plan?.summary }}
        </UiText>
      </UiSurface>

      <div v-if="canViewTasks" class="flight-plan__tasks">
        <FlightPlanTasksPanel
          ref="tasksPanelRef"
          :states="taskStates"
          :crew-members="members"
          :can-edit="canEditMission"
          :can-create="canCreateTasks"
          :loading="loadingTasks"
          :viewer-membership-id="viewerMembershipId"
          :viewer-is-captain="isOwner"
          :can-claim="canClaimTasks"
          :creating-task="creatingTask"
          :is-task-updating="isTaskUpdating"
          :is-task-deleting="isTaskDeleting"
          @create="handleTaskCreate"
          @update="handleTaskUpdate"
          @delete="handleTaskDelete"
          @claim="handleTaskClaim"
          @unclaim="handleTaskUnclaim"
          @add-attachment="handleTaskAttachmentUpload"
          @remove-attachment="handleTaskAttachmentRemove"
          @add-link="handleTaskLinkAdd"
          @remove-link="handleTaskLinkRemove"
        />
        <UiAlert
          v-if="taskFeedback"
          :variant="taskFeedbackIsError ? 'danger' : 'success'"
          layout="inline"
        >
          {{ taskFeedback }}
        </UiAlert>
        <UiAlert v-if="tasksError" variant="danger" layout="inline">
          {{ tasksError }}
        </UiAlert>
      </div>
      <UiSurface v-else variant="panel" class="flight-plan__state">
        <UiText variant="muted">
          {{
            planPublicContributions
              ? 'Sign in to view and claim tasks on this mission.'
              : 'Mission tasks are limited to confirmed crew and the captain.'
          }}
        </UiText>
      </UiSurface>

      <UiSurface variant="panel" class="flight-plan__collaboration">
        <UiStack :gap="'var(--space-md)'">
          <div>
            <UiHeading :level="2" size="h4" :uppercase="false">Crew roster</UiHeading>
            <UiText variant="muted">
              Invite additional passengers and coordinate crews for this mission.
            </UiText>
          </div>

          <template v-if="canViewRoster">
            <div
              v-if="isOwner || isCrewOrganiser"
              class="flight-plan__collaboration-controls"
            >
              <div v-if="isOwner" class="flight-plan__crew-toggle">
                <div class="flight-plan__visibility-toggle">
                  <UiInline :gap="'var(--space-sm)'" align="center">
                    <UiSwitch
                      v-model="planVisibilityLocal"
                      :disabled="planVisibilityTogglePending"
                      @change="togglePlanVisibility"
                    >
                      Public mission page
                    </UiSwitch>
                    <UiTag size="sm" variant="muted">
                      {{ planVisibilityLocal ? 'Public' : 'Private' }}
                    </UiTag>
                  </UiInline>
                  <UiText variant="muted" class="flight-plan__crew-toggle-help">
                    Public missions show roster details to everyone. Private missions keep the mission hidden from anyone who isn’t the captain, crew, or an accepted passenger.
                  </UiText>
                  <UiAlert
                    v-if="planVisibilityFeedback"
                    :variant="planVisibilityFeedbackIsError ? 'danger' : 'success'"
                    layout="inline"
                  >
                    {{ planVisibilityFeedback }}
                  </UiAlert>
                </div>
                <div class="flight-plan__contributions-toggle">
                  <UiInline :gap="'var(--space-sm)'" align="center">
                    <UiSwitch
                      v-model="publicContributionsLocal"
                      :disabled="publicContributionsTogglePending"
                      @change="togglePublicContributions"
                    >
                      Public contributions (auth required)
                    </UiSwitch>
                    <UiTag size="sm" variant="muted">
                      {{ publicContributionsLocal ? 'Enabled' : 'Disabled' }}
                    </UiTag>
                  </UiInline>
                  <UiText variant="muted" class="flight-plan__crew-toggle-help">
                    When enabled, any logged-in crew member can view this mission, see the roster, and claim tasks for themselves. Only captains can edit missions or add new tasks.
                  </UiText>
                  <UiAlert
                    v-if="publicContributionsFeedback"
                    :variant="publicContributionsFeedbackIsError ? 'danger' : 'success'"
                    layout="inline"
                  >
                    {{ publicContributionsFeedback }}
                  </UiAlert>
                </div>
                <UiInline :gap="'var(--space-sm)'" align="center">
                  <UiSwitch
                    v-model="crewPromotionSettingLocal"
                    :disabled="crewPromotionTogglePending"
                    @change="toggleCrewPromotionSetting"
                  >
                    Allow crew organisers to promote passengers to crew
                  </UiSwitch>
                  <UiTag size="sm" variant="muted">
                    {{ crewPromotionSetting ? 'Enabled' : 'Disabled' }}
                  </UiTag>
                </UiInline>
                <UiText variant="muted" class="flight-plan__crew-toggle-help">
                  When enabled, accepted crew organisers can promote passengers directly from this roster.
                </UiText>
                <UiAlert
                  v-if="crewPromotionFeedback"
                  :variant="crewPromotionFeedbackIsError ? 'danger' : 'success'"
                  layout="inline"
                >
                  {{ crewPromotionFeedback }}
                </UiAlert>
                <UiInline :gap="'var(--space-sm)'" align="center">
                  <UiSwitch
                    v-model="passengerTaskSettingLocal"
                    :disabled="passengerTaskTogglePending"
                    @change="togglePassengerTaskSetting"
                  >
                    Allow passengers to start mission tasks
                  </UiSwitch>
                  <UiTag size="sm" variant="muted">
                    {{ passengerTaskSetting ? 'Enabled' : 'Disabled' }}
                  </UiTag>
                </UiInline>
                <UiText variant="muted" class="flight-plan__crew-toggle-help">
                  When enabled, accepted passengers can create tasks and manage their own cards. Crew organisers retain full task controls.
                </UiText>
                <UiAlert
                  v-if="passengerTaskFeedback"
                  :variant="passengerTaskFeedbackIsError ? 'danger' : 'success'"
                  layout="inline"
                >
                  {{ passengerTaskFeedback }}
                </UiAlert>
              </div>
              <div v-else class="flight-plan__crew-organiser-note">
                <UiText variant="muted" class="flight-plan__crew-toggle-help">
                  {{
                    crewPromotionSetting
                      ? 'You can promote accepted passengers to crew on this mission.'
                      : 'Only the captain can currently promote passengers to crew.'
                  }}
                </UiText>
                <UiText variant="muted" class="flight-plan__crew-toggle-help">
                  Only captains can invite new collaborators for this mission.
                </UiText>
                <UiText variant="muted" class="flight-plan__crew-toggle-help">
                  {{
                    planIsPublic
                      ? 'This mission page is public — roster details are visible to everyone.'
                      : 'This mission is private — only confirmed crew can view the roster.'
                  }}
                </UiText>
                <UiText variant="muted" class="flight-plan__crew-toggle-help">
                  Passenger task creation is {{ passengerTaskSetting ? 'enabled' : 'disabled' }} for this mission.
                </UiText>
              </div>
            </div>

            <form v-if="canInvite" @submit.prevent="sendFlightPlanInvite">
              <UiStack :gap="'var(--space-sm)'">
                <UiFormField label="Crew profile slug" :required="true">
                  <template #default="{ id, describedBy }">
                    <UiTextInput
                      v-model="inviteSlug"
                      :id="id"
                      :described-by="describedBy"
                      placeholder="crew-slug"
                      :disabled="pendingInvite"
                      autocomplete="off"
                    />
                  </template>
                </UiFormField>
                <UiInline :gap="'var(--space-sm)'" class="flight-plan__invite-actions">
                  <UiButton
                    type="submit"
                    :disabled="pendingInvite || !inviteSlugReady.length"
                    :loading="pendingInvite"
                  >
                    Send invite
                  </UiButton>
                  <UiButton type="button" variant="ghost" @click="() => (inviteSlug = '')">
                    Reset
                  </UiButton>
                </UiInline>
              </UiStack>
            </form>
            <UiText v-else-if="isCrewOrganiser" variant="muted">
              Only captains can invite new collaborators for this mission.
            </UiText>

            <UiText v-if="searchingInvitees && canInvite" variant="muted">
              Scanning crew manifest…
            </UiText>

            <UiSurface
              v-if="canInvite && inviteSuggestions.length"
              variant="panel"
              borderless
              class="flight-plan__invite-suggestions"
            >
              <ul>
                <li
                  v-for="suggestion in inviteSuggestions"
                  :key="suggestion.profileSlug ?? suggestion.id ?? suggestion.callSign ?? 'unknown'"
                >
                  <UiButton
                    type="button"
                    variant="ghost"
                    class="flight-plan__invite-suggestion-button"
                    block
                    @click="selectInviteSuggestion(suggestion)"
                  >
                    <span class="flight-plan__invite-suggestion-name">
                      {{ suggestion.callSign ?? suggestion.profileSlug ?? 'Unknown crew' }}
                    </span>
                    <span v-if="suggestion.profileSlug" class="flight-plan__invite-suggestion-slug">
                      /gangway/crew-quarters/{{ suggestion.profileSlug }}
                    </span>
                    <UiTag v-if="suggestion.role" variant="muted">
                      {{ suggestion.role }}
                    </UiTag>
                  </UiButton>
                </li>
              </ul>
            </UiSurface>

            <UiAlert
              v-if="inviteFeedback"
              :variant="inviteFeedbackIsError ? 'danger' : 'success'"
              layout="inline"
            >
              {{ inviteFeedback }}
            </UiAlert>
            <UiAlert v-else-if="inviteeError" variant="danger" layout="inline">
              {{ inviteeError }}
            </UiAlert>

            <div class="flight-plan__member-section">
              <UiText v-if="loadingMembers" variant="muted">Loading crew roster…</UiText>
              <UiAlert v-else-if="membersError" variant="danger" layout="inline">
                {{ membersError }}
              </UiAlert>
              <UiText v-else-if="!rosterGroupItems.length" variant="muted">
                No collaborators yet — you're the sole navigator.
              </UiText>
              <div v-else class="flight-plan__roster-groups">
                <section
                  v-for="group in rosterGroupItems"
                  :key="group.key"
                  class="flight-plan__roster-group"
                >
                  <UiHeading :level="3" size="h5" class="flight-plan__roster-group-title">
                    {{ group.label }}
                  </UiHeading>
                  <UiStatusList :items="group.items" class="flight-plan__member-list">
                    <template #primary="{ item }">
                      <NuxtLink
                        v-if="memberProfileLink(item.member)"
                        :to="memberProfileLink(item.member) || undefined"
                      >
                        {{ memberDisplayName(item.member) }}
                      </NuxtLink>
                      <span v-else>{{ memberDisplayName(item.member) }}</span>
                      <UiText variant="caption" class="flight-plan__member-status">
                        {{ membershipStatusLabel(item.member) }}
                      </UiText>
                    </template>
                    <template #meta="{ item }">
                      <UiText
                        v-if="item.member.status === 'pending' && formatTimestamp(item.member.invitedAt)"
                        variant="caption"
                      >
                        Invited {{ formatTimestamp(item.member.invitedAt) }}
                      </UiText>
                      <UiText
                        v-else-if="item.member.status === 'accepted' && formatTimestamp(item.member.respondedAt)"
                        variant="caption"
                      >
                        Joined {{ formatTimestamp(item.member.respondedAt) }}
                      </UiText>
                    </template>
                    <template #actions="{ item }">
                      <UiButton
                        v-if="
                          viewerCanPromotePassengers &&
                            item.member.role === 'guest' &&
                            item.member.status === 'accepted'
                        "
                        variant="secondary"
                        size="sm"
                        type="button"
                        @click="promoteMemberToCrew(item.member.id)"
                        :loading="isPromotingMember(item.member.id)"
                      >
                        Promote to crew
                      </UiButton>
                    </template>
                  </UiStatusList>
                </section>
              </div>
            </div>
          </template>
          <template v-else>
            <UiText variant="muted">
              This roster is private. Only the captain and confirmed crew can view it.
            </UiText>
            <UiText v-if="!session.isAuthenticated" variant="muted">
              Sign in with your crew account to check whether you have access.
            </UiText>
          </template>
        </UiStack>
      </UiSurface>

      <UiSurface
        v-if="planOwnerSlug"
        class="flight-plan__logs"
        variant="panel"
      >
        <LogList
          :owner-slug="planOwnerSlug"
          :min-role="planOwnerRole"
          :limit="5"
          title="Logbook updates"
          empty-label="No logs yet for this crew member."
        />
      </UiSurface>
    </UiStack>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  createError,
  navigateTo,
  useHead,
  useRoute,
  useRequestURL,
} from '#imports';
import { useDebounceFn } from '@vueuse/core';

import {
  canEditFlightPlanMission,
  createFlightPlanIteration,
  canDeleteFlightPlanForViewer,
  canManageFlightPlanLifecycleForViewer,
  getFlightPlanBucketLabel,
  getFlightPlanStatusLabel,
  reopenFlightPlan,
  resolveFlightPlanLifecycleStatus,
  transitionFlightPlanStatus,
  useFlightPlan,
  useFlightPlanSlug,
  useFlightPlanCrew,
  useFlightPlanTasks,
  deleteFlightPlan,
  updateFlightPlan,
  type FlightPlanMember,
  type FlightPlanInvitee,
} from '~/domains/flightPlans';
import { useSessionStore } from '~/stores/session';
import { useAdminModeStore } from '~/stores/adminMode';
import LogList from '~/components/LogList.vue';
import PrivilegedControlsFlyout from '~/components/PrivilegedControlsFlyout.client.vue';
import RichTextRenderer from '~/components/RichTextRenderer.vue';
import FlightPlanForm from '~/components/flight-plans/FlightPlanForm.vue';
import FlightPlanLifecycleControls from '~/components/flight-plans/FlightPlanLifecycleControls.vue';
import FlightPlanGalleryEditor from '~/components/flight-plans/FlightPlanGalleryEditor.vue';
import FlightPlanGallerySection from '~/components/flight-plans/FlightPlanGallerySection.vue';
import FlightPlanTasksPanel from '~/components/flight-plans/FlightPlanTasksPanel.vue';
import {
  createGallerySlideDraft,
  type FlightPlanFormValues,
  type FlightPlanGallerySlideDraft,
} from '~/components/flight-plans/types';
import { useEditorMutationOutbox } from '~/composables/useEditorMutationOutbox';
import {
  extractEditorWriteErrorCode,
  extractEditorWriteErrorMessage,
} from '~/modules/editor/locks';
import { randomToken } from '~/modules/editor/session';
import { deduceGalleryMediaType } from '~/modules/media/galleryMedia';
import { normalizeIdentifier } from '~/utils/identifiers';
import { editorStringToRichText, richTextToEditorString } from '~/utils/richText';
import {
  UiAlert,
  UiButton,
  UiFormField,
  UiHeading,
  UiInline,
  UiLinkButton,
  UiStack,
  UiStatusList,
  UiSurface,
  UiSwitch,
  UiTag,
  UiText,
  UiTextInput,
} from '~/components/ui';
import { requestAuthDialog } from '~/composables/useAuthDialog';

const route = useRoute();
const session = useSessionStore();
const adminMode = useAdminModeStore();
const inviteSlug = ref('');
const inviteSlugReady = computed(() => inviteSlug.value.trim());

const { planSlug: routePlanSlug, canonicalPath } = useFlightPlanSlug();

if (!routePlanSlug.value) {
  throw createError({ statusCode: 404, statusMessage: 'Flight plan not found' });
}

const cloneRouteQuery = () => {
  const result: Record<string, string | string[]> = {};
  Object.entries(route.query).forEach(([key, value]) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      result[key] = value.map((entry) => String(entry));
    } else {
      result[key] = String(value);
    }
  });
  return result;
};

if (canonicalPath.value && canonicalPath.value !== route.path) {
  await navigateTo(
    {
      path: canonicalPath.value,
      query: cloneRouteQuery(),
      hash: route.hash || undefined,
    },
    { replace: true, redirectCode: 301 },
  );
}

const {
  data: planData,
  pending,
  error,
  plan: planResult,
  refresh: refreshPlan,
} = await useFlightPlan(routePlanSlug);

const plan = computed(() => planResult.value ?? planData.value ?? null);
const planRevision = computed(() => {
  const revision = (plan.value as { revision?: unknown } | null)?.revision;
  if (typeof revision === 'number' && Number.isFinite(revision) && revision > 0) {
    return Math.trunc(revision);
  }
  return null;
});
const planIsPublic = computed(() => Boolean(plan.value?.isPublic));
const planPublicContributions = computed(() => Boolean(plan.value?.publicContributions));
const planOwnerSlug = computed(() => plan.value?.owner?.profileSlug ?? null);
const planOwnerRole = computed(() => plan.value?.owner?.role ?? null);
const planOwnerId = computed(() => normalizeIdentifier(plan.value?.owner?.id));
const planCategory = computed(() => plan.value?.category ?? null);
const planStatus = computed(() => resolveFlightPlanLifecycleStatus(plan.value?.status ?? null));
const planStatusLabel = computed(() => getFlightPlanStatusLabel(planStatus.value));
const planStatusBucketLabel = computed(() => getFlightPlanBucketLabel(planStatus.value));
const errorStatus = computed(() => {
  const rawError = error.value as { statusCode?: number; response?: { status?: number } } | null;
  const statusCode = Number.parseInt(
    String(rawError?.statusCode ?? rawError?.response?.status ?? ''),
    10,
  );
  return Number.isFinite(statusCode) ? statusCode : null;
});
const errorMessage = computed(() => {
  if (plan.value) return null;
  if (errorStatus.value === 401) {
    return 'Sign in to view this mission.';
  }
  if (errorStatus.value === 403) {
    return 'You do not have permission to view this mission.';
  }
  if (errorStatus.value === 404) {
    return 'This mission no longer exists. It may have been deleted.';
  }
  const rawError = error.value as { statusMessage?: string; message?: string } | null;
  if (rawError?.statusMessage) return rawError.statusMessage;
  if (rawError?.message) return rawError.message;
  return pending.value ? null : 'Flight plan not found.';
});

const openAuthDialog = () => {
  requestAuthDialog();
};

const formattedDate = computed(() => {
  const date = plan.value?.displayDate ?? plan.value?.eventDate ?? null;
  return date && date.trim().length > 0 ? date : null;
});

const metaLine = computed(() => {
  const parts: string[] = [];
  if (formattedDate.value) {
    parts.push(formattedDate.value);
  }
  if (plan.value?.location) {
    parts.push(plan.value.location);
  }
  if (parts.length === 0) return null;
  return parts.join(' · ');
});

const flightPlanSlug = computed(() => plan.value?.slug ?? null);
const planWriteOutbox = useEditorMutationOutbox();

const requirePlanRevision = (): number => {
  const revision = planRevision.value;
  if (revision == null) {
    throw new Error('Mission revision unavailable. Reload the page and try again.');
  }
  return revision;
};

const resolvePlanWriteErrorMessage = (error: unknown, fallback: string): string => {
  const errorCode = extractEditorWriteErrorCode(error);
  if (errorCode === 'revision_conflict') {
    return 'Mission changed on the server. Reload the mission and retry your save.';
  }
  if (errorCode === 'editor_locked') {
    return 'Mission is locked by another editor session. Retry after lock expiry.';
  }
  return extractEditorWriteErrorMessage(error, fallback);
};
const sessionUserId = computed(() => normalizeIdentifier(session.currentUser?.id));
const isOwner = computed(() => {
  const ownerId = planOwnerId.value;
  const currentUserId = sessionUserId.value;
  return ownerId != null && currentUserId != null && ownerId === currentUserId;
});
const viewerRole = computed(() => {
  const role = session.currentUser?.role;
  return typeof role === 'string' && role.trim().length > 0 ? role : null;
});
const canManageLifecycle = computed(() =>
  canManageFlightPlanLifecycleForViewer({
    ownerId: planOwnerId.value,
    viewerUserId: sessionUserId.value,
    viewerRole: viewerRole.value,
  }),
);
const canDeleteMission = computed(() =>
  canDeleteFlightPlanForViewer({
    ownerId: planOwnerId.value,
    viewerUserId: sessionUserId.value,
    viewerRole: viewerRole.value,
  }),
);

const attemptedAuthedRefresh = ref(false);
watch(
  () => session.isAuthenticated,
  async (authed) => {
    if (!process.client) return;
    if (!authed) return;
    if (attemptedAuthedRefresh.value) return;
    if (plan.value) {
      attemptedAuthedRefresh.value = true;
      return;
    }
    attemptedAuthedRefresh.value = true;
    await refreshPlan();
  },
  { immediate: true },
);

const {
  members,
  loadMembers,
  membersError,
  loadingMembers,
  inviteFeedback,
  inviteFeedbackIsError,
  pendingInvite,
  inviteCrewmate,
  searchInvitees,
  invitees,
  searchingInvitees,
  inviteeError,
  promoteGuest,
  viewerMembership,
  viewerIsCrewOrganiser: rosterViewerIsCrewOrganiser,
  canInvite: crewCanInvite,
} = useFlightPlanCrew(flightPlanSlug, {
  allowPublicRoster: computed(
    () => planIsPublic.value || (planPublicContributions.value && session.isAuthenticated),
  ),
});

const {
  orderedStates: taskStates,
  loadingTasks,
  tasksError,
  creatingTask,
  isTaskUpdating,
  isTaskDeleting,
  createTask,
  updateTask,
  deleteTask,
  claimTask,
  unclaimTask,
  uploadAttachment,
  removeAttachment,
  addLink,
  removeLink,
} = useFlightPlanTasks(flightPlanSlug);

const membershipSortWeight = (member: FlightPlanMember): number => {
  if (member.role === 'owner') return 0;
  if (member.status === 'accepted') return 1;
  if (member.status === 'pending') return 2;
  if (member.status === 'declined') return 3;
  if (member.status === 'revoked') return 4;
  return 5;
};

const memberNameCollator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

const sortedMembers = computed(() => {
  return [...members.value].sort((a, b) => {
    const diff = membershipSortWeight(a) - membershipSortWeight(b);
    if (diff !== 0) return diff;
    const nameA = a.user?.callSign ?? a.user?.profileSlug ?? '';
    const nameB = b.user?.callSign ?? b.user?.profileSlug ?? '';
    return memberNameCollator.compare(nameA, nameB);
  });
});

const buildRosterItemId = (groupKey: string, member: FlightPlanMember, index: number) => {
  if (typeof member.id === 'number') {
    return `${groupKey}-${member.id}`;
  }
  if (typeof member.userId === 'number') {
    return `${groupKey}-user-${member.userId}`;
  }
  if (member.user?.profileSlug) {
    return `${groupKey}-${member.user.profileSlug}`;
  }
  if (member.user?.callSign) {
    return `${groupKey}-${member.user.callSign.toLowerCase()}`;
  }
  return `${groupKey}-public-${index}`;
};

const captainMembers = computed(() =>
  sortedMembers.value.filter((member) => member.role === 'owner'),
);
const crewMembersOnly = computed(() =>
  sortedMembers.value.filter((member) => member.role === 'crew'),
);
const passengerMembers = computed(() =>
  sortedMembers.value.filter((member) => member.role === 'guest'),
);

const rosterGroupItems = computed(() =>
  [
    { key: 'captain', label: 'Captain', members: captainMembers.value },
    { key: 'crew', label: 'Crew', members: crewMembersOnly.value },
    { key: 'passengers', label: 'Passengers', members: passengerMembers.value },
  ]
    .map((group) => ({
      ...group,
      items: group.members.map((member, index) => ({
        id: buildRosterItemId(group.key, member, index),
        member,
      })),
    }))
    .filter((group) => group.members.length > 0),
);

const isCrewOrganiser = computed(() => rosterViewerIsCrewOrganiser.value);
const canInvite = computed(() => isOwner.value || crewCanInvite.value);
const viewerIsAcceptedRosterMember = computed(
  () => viewerMembership.value?.status === 'accepted',
);
const canViewRoster = computed(
  () =>
    planIsPublic.value ||
    isOwner.value ||
    viewerIsAcceptedRosterMember.value ||
    (planPublicContributions.value && session.isAuthenticated),
);

const runQueuedPlanWrite = async ({
  payload,
  refreshMembers = false,
}: {
  payload: Record<string, unknown>;
  refreshMembers?: boolean;
}) => {
  const slug = flightPlanSlug.value;
  if (!slug) {
    throw new Error('Flight plan unavailable.');
  }

  let requestContext: { baseRevision: number; idempotencyKey: string } | null = null;
  planWriteOutbox.clearError();

  await planWriteOutbox.enqueue(async () => {
    if (!requestContext) {
      requestContext = {
        baseRevision: requirePlanRevision(),
        idempotencyKey: `flight-plan-write:${randomToken()}`,
      };
    }

    await updateFlightPlan({
      auth: session.bearerToken,
      slug,
      payload,
      baseRevision: requestContext.baseRevision,
      idempotencyKey: requestContext.idempotencyKey,
    });

    await refreshPlan();
    if (refreshMembers) {
      await loadMembers();
    }
  });
};
const membershipResolved = computed(() => !loadingMembers.value);
const viewerIsContributor = computed(() => {
  if (!planPublicContributions.value) return false;
  const membership = viewerMembership.value;
  const userId = normalizeIdentifier(membership?.userId);
  const invitedById = normalizeIdentifier(membership?.invitedBy?.id);
  return (
    membership?.role === 'crew' &&
    membership?.status === 'accepted' &&
    userId != null &&
    invitedById != null &&
    invitedById === userId &&
    !isOwner.value
  );
});
const canEditMission = computed(() => {
  return canEditFlightPlanMission({
    ownerId: planOwnerId.value,
    viewerUserId: sessionUserId.value,
    viewerRole: viewerRole.value,
    adminViewEnabled: adminMode.adminViewEnabled,
    adminEditEnabled: adminMode.adminEditEnabled,
    isOwner: isOwner.value,
    isCrewOrganiser: isCrewOrganiser.value,
    membershipResolved: membershipResolved.value,
    viewerIsContributor: viewerIsContributor.value,
    status: planStatus.value,
  });
});

const inviteSuggestions = computed(() => invitees.value ?? []);
const crewPromotionSettingLocal = ref(false);
const crewPromotionSetting = computed(() => crewPromotionSettingLocal.value);
const passengerTaskSettingLocal = ref(false);
const passengerTaskSetting = computed(() => passengerTaskSettingLocal.value);
const planVisibilityLocal = ref(false);
const planVisibilityFeedback = ref('');
const planVisibilityFeedbackIsError = ref(false);
const planVisibilityTogglePending = ref(false);
const publicContributionsLocal = ref(false);
const publicContributionsFeedback = ref('');
const publicContributionsFeedbackIsError = ref(false);
const publicContributionsTogglePending = ref(false);
const viewerCanPromotePassengers = computed(
  () => isOwner.value || (crewPromotionSetting.value && isCrewOrganiser.value),
);
const viewerMembershipId = computed(() => viewerMembership.value?.id ?? null);
const viewerIsAcceptedPassenger = computed(
  () => viewerMembership.value?.role === 'guest' && viewerMembership.value?.status === 'accepted',
);
const passengersCanStartTasks = computed(
  () => passengerTaskSetting.value && viewerIsAcceptedPassenger.value,
);
const canCreateTasks = computed(
  () => !viewerIsContributor.value && (canEditMission.value || passengersCanStartTasks.value),
);
const canViewTasks = computed(
  () =>
    viewerMembership.value?.status === 'accepted' ||
    isOwner.value ||
    (planPublicContributions.value && session.isAuthenticated),
);
const canClaimTasks = computed(
  () => planPublicContributions.value && session.isAuthenticated && !canEditMission.value,
);
const tasksPanelRef = ref<InstanceType<typeof FlightPlanTasksPanel> | null>(null);
const taskFeedback = ref('');
const taskFeedbackIsError = ref(false);

type DebouncedSearch = ReturnType<typeof useDebounceFn<(query: string) => void>> & {
  cancel?: () => void;
};

const runInviteSearch = useDebounceFn((query: string) => {
  searchInvitees(query);
}, 220) as DebouncedSearch;

const membershipStatusLabel = (member: FlightPlanMember): string => {
  if (member.role === 'owner') return 'Captain';
  if (member.role === 'crew') {
    if (member.status === 'pending') return 'Crew (pending acceptance)';
    if (member.status === 'declined') return 'Crew (declined)';
    if (member.status === 'revoked') return 'Crew (revoked)';
    return 'Crew organiser';
  }
  if (member.role === 'guest') {
    switch (member.status) {
      case 'pending':
        return 'Passenger (pending acceptance)';
      case 'declined':
        return 'Passenger (declined)';
      case 'revoked':
        return 'Passenger (revoked)';
      default:
        return 'Passenger';
    }
  }
  return member.status;
};

const timestampFormatter = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

const formatTimestamp = (value: string | null): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return timestampFormatter.format(date);
};

const memberDisplayName = (member: FlightPlanMember): string => {
  if (member.user?.callSign) return member.user.callSign;
  if (member.user?.profileSlug) return member.user.profileSlug;
  if (typeof member.userId === 'number') return `Crew #${member.userId}`;
  return 'Crew manifest entry';
};

const memberProfileLink = (member: FlightPlanMember): string | null => {
  const slug = member.user?.profileSlug;
  return slug ? `/gangway/crew-quarters/${slug}` : null;
};

const selectInviteSuggestion = (suggestion: FlightPlanInvitee) => {
  if (suggestion.profileSlug) {
    inviteSlug.value = suggestion.profileSlug;
    invitees.value = [];
  }
};

const sendFlightPlanInvite = async () => {
  const crewProfileSlug = inviteSlugReady.value;
  if (!canInvite.value || !crewProfileSlug) return;
  const result = await inviteCrewmate(crewProfileSlug);
  if (result.ok) {
    inviteFeedback.value = 'Invitation dispatched.';
    inviteFeedbackIsError.value = false;
    inviteSlug.value = '';
    invitees.value = [];
    if (typeof runInviteSearch.cancel === 'function') {
      runInviteSearch.cancel();
    }
    await loadMembers();
  }
};

const promotingMembers = ref<Set<number>>(new Set());
const setPromotingMember = (memberId: number | null, active: boolean) => {
  if (typeof memberId !== 'number') return;
  const next = new Set(promotingMembers.value);
  if (active) {
    next.add(memberId);
  } else {
    next.delete(memberId);
  }
  promotingMembers.value = next;
};
const isPromotingMember = (memberId: number | null) =>
  typeof memberId === 'number' ? promotingMembers.value.has(memberId) : false;

const promoteMemberToCrew = async (memberId: number | null) => {
  if (typeof memberId !== 'number') return;
  setPromotingMember(memberId, true);
  try {
    const result = await promoteGuest(memberId);
    if (result.ok) {
      inviteFeedback.value = 'Crew member promoted to organiser.';
      inviteFeedbackIsError.value = false;
      await loadMembers();
    } else {
      inviteFeedback.value = result.message ?? 'Unable to promote member.';
      inviteFeedbackIsError.value = true;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to promote member.';
    inviteFeedback.value = message;
    inviteFeedbackIsError.value = true;
  } finally {
    setPromotingMember(memberId, false);
  }
};

const setTaskFeedback = (message: string, isError = false) => {
  taskFeedback.value = message;
  taskFeedbackIsError.value = isError;
};

const handleTaskCreate = async (payload: Record<string, unknown>) => {
  const result = await createTask(payload as { title: string });
  if (result.ok) {
    setTaskFeedback('Task created.');
    tasksPanelRef.value?.resetForm();
  } else {
    setTaskFeedback(result.message ?? 'Unable to create mission task.', true);
  }
};

const handleTaskUpdate = async ({
  taskId,
  data,
}: {
  taskId: number;
  data: Record<string, unknown>;
}) => {
  const result = await updateTask(taskId, data);
  if (result.ok) {
    setTaskFeedback('Task updated.');
  } else {
    setTaskFeedback(result.message ?? 'Unable to update mission task.', true);
  }
};

const handleTaskDelete = async (taskId: number) => {
  const result = await deleteTask(taskId);
  if (result.ok) {
    setTaskFeedback('Task deleted.');
  } else {
    setTaskFeedback(result.message ?? 'Unable to delete mission task.', true);
  }
};

const handleTaskClaim = async (taskId: number) => {
  const result = await claimTask(taskId);
  if (result.ok) {
    setTaskFeedback('Task claimed.');
  } else {
    setTaskFeedback(result.message ?? 'Unable to claim mission task.', true);
  }
};

const handleTaskUnclaim = async (taskId: number) => {
  const result = await unclaimTask(taskId);
  if (result.ok) {
    setTaskFeedback('Task unclaimed.');
  } else {
    setTaskFeedback(result.message ?? 'Unable to unclaim mission task.', true);
  }
};

const handleTaskAttachmentUpload = async ({
  taskId,
  file,
}: {
  taskId: number;
  file: File;
}) => {
  const result = await uploadAttachment(taskId, file);
  if (result.ok) {
    setTaskFeedback('Attachment uploaded.');
  } else {
    setTaskFeedback(result.message ?? 'Unable to upload attachment.', true);
  }
};

const handleTaskAttachmentRemove = async ({
  taskId,
  attachmentId,
}: {
  taskId: number;
  attachmentId: string;
}) => {
  const result = await removeAttachment(taskId, attachmentId);
  if (result.ok) {
    setTaskFeedback('Attachment removed.');
  } else {
    setTaskFeedback(result.message ?? 'Unable to remove attachment.', true);
  }
};

const handleTaskLinkAdd = async ({
  taskId,
  url,
  title,
}: {
  taskId: number;
  url: string;
  title?: string;
}) => {
  const result = await addLink(taskId, { url, title });
  if (result.ok) {
    setTaskFeedback('Link added.');
  } else {
    setTaskFeedback(result.message ?? 'Unable to add link.', true);
  }
};

const handleTaskLinkRemove = async ({
  taskId,
  linkId,
}: {
  taskId: number;
  linkId: string;
}) => {
  const result = await removeLink(taskId, linkId);
  if (result.ok) {
    setTaskFeedback('Link removed.');
  } else {
    setTaskFeedback(result.message ?? 'Unable to remove link.', true);
  }
};

const togglePlanVisibility = async (nextValue: boolean) => {
  if (!isOwner.value || !flightPlanSlug.value) return;
  planVisibilityTogglePending.value = true;
  planVisibilityFeedback.value = '';
  planVisibilityFeedbackIsError.value = false;
  try {
    await runQueuedPlanWrite({
      payload: { isPublic: nextValue },
      refreshMembers: true,
    });
    planVisibilityFeedback.value = nextValue
      ? 'Mission page is now public.'
      : 'Mission page is now private.';
    planVisibilityFeedbackIsError.value = false;
  } catch (error: any) {
    planVisibilityFeedback.value = resolvePlanWriteErrorMessage(
      error,
      'Unable to update mission visibility.',
    );
    planVisibilityFeedbackIsError.value = true;
    planVisibilityLocal.value = !nextValue;
  } finally {
    planVisibilityTogglePending.value = false;
  }
};

const togglePublicContributions = async (nextValue: boolean) => {
  if (!isOwner.value || !flightPlanSlug.value) return;
  publicContributionsTogglePending.value = true;
  publicContributionsFeedback.value = '';
  publicContributionsFeedbackIsError.value = false;
  try {
    await runQueuedPlanWrite({
      payload: { publicContributions: nextValue },
      refreshMembers: true,
    });
    publicContributionsFeedback.value = nextValue
      ? 'Any logged-in crew can now view and claim tasks on this mission.'
      : 'Public contributions disabled.';
    publicContributionsFeedbackIsError.value = false;
  } catch (error: any) {
    publicContributionsFeedback.value = resolvePlanWriteErrorMessage(
      error,
      'Unable to update contribution access.',
    );
    publicContributionsFeedbackIsError.value = true;
    publicContributionsLocal.value = !nextValue;
  } finally {
    publicContributionsTogglePending.value = false;
  }
};

const crewPromotionTogglePending = ref(false);
const crewPromotionFeedback = ref('');
const crewPromotionFeedbackIsError = ref(false);
const passengerTaskTogglePending = ref(false);
const passengerTaskFeedback = ref('');
const passengerTaskFeedbackIsError = ref(false);

const toggleCrewPromotionSetting = async (nextValue: boolean) => {
  if (!isOwner.value || !flightPlanSlug.value) return;
  crewPromotionTogglePending.value = true;
  crewPromotionFeedback.value = '';
  crewPromotionFeedbackIsError.value = false;
  try {
    await runQueuedPlanWrite({
      payload: { crewCanPromotePassengers: nextValue },
      refreshMembers: true,
    });
    crewPromotionFeedback.value = nextValue
      ? 'Crew organisers can now promote passengers.'
      : 'Only you can promote passengers now.';
    crewPromotionFeedbackIsError.value = false;
  } catch (error: any) {
    crewPromotionFeedback.value = resolvePlanWriteErrorMessage(
      error,
      'Unable to update permission.',
    );
    crewPromotionFeedbackIsError.value = true;
    crewPromotionSettingLocal.value = !nextValue;
  } finally {
    crewPromotionTogglePending.value = false;
  }
};

const togglePassengerTaskSetting = async (nextValue: boolean) => {
  if (!isOwner.value || !flightPlanSlug.value) return;
  passengerTaskTogglePending.value = true;
  passengerTaskFeedback.value = '';
  passengerTaskFeedbackIsError.value = false;
  try {
    await runQueuedPlanWrite({
      payload: { passengersCanCreateTasks: nextValue },
      refreshMembers: false,
    });
    passengerTaskFeedback.value = nextValue
      ? 'Passengers can now create and manage their own tasks on this mission.'
      : 'Passenger task creation disabled.';
    passengerTaskFeedbackIsError.value = false;
  } catch (error: any) {
    passengerTaskFeedback.value = resolvePlanWriteErrorMessage(
      error,
      'Unable to update task permissions.',
    );
    passengerTaskFeedbackIsError.value = true;
    passengerTaskSettingLocal.value = !nextValue;
  } finally {
    passengerTaskTogglePending.value = false;
  }
};

watch(
  () => [inviteSlug.value, canInvite.value, flightPlanSlug.value] as const,
  ([rawSlug, inviteAllowed, slug]) => {
    if (!inviteAllowed || typeof slug !== 'string' || slug.length === 0) {
      invitees.value = [];
      if (typeof runInviteSearch.cancel === 'function') {
        runInviteSearch.cancel();
      }
      return;
    }

    const query = rawSlug.trim();
    if (!query) {
      invitees.value = [];
      if (typeof runInviteSearch.cancel === 'function') {
        runInviteSearch.cancel();
      }
      return;
    }

    runInviteSearch(query);
  },
  { immediate: true },
);

const requestURL = useRequestURL();

const showEditForm = ref(false);
const editSubmitting = ref(false);
const editFeedback = ref('');
const editFeedbackIsError = ref(false);
const editInitialValues = ref<FlightPlanFormValues | null>(null);
const galleryEditorSlides = ref<FlightPlanGallerySlideDraft[]>([]);
const editFormRef = ref<InstanceType<typeof FlightPlanForm> | null>(null);
const deleteSubmitting = ref(false);
const deleteFeedback = ref('');
const deleteFeedbackIsError = ref(false);
const lifecycleSubmitting = ref(false);
const lifecycleFeedback = ref('');
const lifecycleFeedbackIsError = ref(false);

const resetEditFeedback = () => {
  editFeedback.value = '';
  editFeedbackIsError.value = false;
};

const resetDeleteFeedback = () => {
  deleteFeedback.value = '';
  deleteFeedbackIsError.value = false;
};

const resetLifecycleFeedback = () => {
  lifecycleFeedback.value = '';
  lifecycleFeedbackIsError.value = false;
};

const toggleEditForm = () => {
  showEditForm.value = !showEditForm.value;
  if (!showEditForm.value) {
    resetEditFeedback();
  }
};

const resolveEditableSlideImageType = (
  slide: NonNullable<(typeof plan.value)>['gallerySlides'][number],
): 'upload' | 'url' => {
  const hasUploadAsset = typeof slide.asset?.id === 'number' && Number.isFinite(slide.asset.id);
  const hasImageUrl = typeof slide.imageUrl === 'string' && slide.imageUrl.trim().length > 0;

  if (slide.imageType === 'url') return 'url';
  if (slide.imageType === 'upload') return 'upload';

  if (hasUploadAsset) return 'upload';
  if (hasImageUrl) return 'url';
  return 'upload';
};

const toEditableGallerySlides = (
  next: (typeof plan.value) | null,
): FlightPlanFormValues['gallerySlides'] =>
  (next?.gallerySlides ?? []).map((slide) => ({
    label: slide.label ?? '',
    title: slide.title ?? '',
    description: slide.description ?? '',
    mediaType: deduceGalleryMediaType({
      mediaType: slide.mediaType,
      mimeType: slide.asset?.mimeType,
      filename: slide.asset?.filename,
      url: slide.asset?.url ?? slide.imageUrl,
    }),
    imageType: resolveEditableSlideImageType(slide),
    imageUrl: slide.asset?.url ?? slide.imageUrl ?? '',
    imageAlt: slide.imageAlt ?? '',
    creditLabel: slide.creditLabel ?? '',
    creditUrl: slide.creditUrl ?? '',
    galleryImage: slide.asset?.id ?? null,
  }));

watch(
  plan,
  (next) => {
    resetDeleteFeedback();
    resetLifecycleFeedback();
    if (!next) {
      editInitialValues.value = null;
      galleryEditorSlides.value = [];
      return;
    }
    const gallerySlides = toEditableGallerySlides(next);
    editInitialValues.value = {
      title: next.title ?? '',
      summary: next.summary ?? '',
      location: next.location ?? '',
      category: (next.category as any) ?? 'project',
      eventDate: next.eventDate ? next.eventDate.slice(0, 10) : '',
      body: richTextToEditorString(next.body ?? null) || '',
      gallerySlides,
    };
    galleryEditorSlides.value = gallerySlides.map((slide) => createGallerySlideDraft(slide));
  },
  { immediate: true },
);

const resolveLifecycleError = (error: any, fallback: string): string => {
  return (
    error?.statusMessage ||
    error?.data?.error ||
    error?.message ||
    fallback
  );
};

const handleStatusTransition = async ({
  status,
  statusReason,
}: {
  status: Parameters<typeof transitionFlightPlanStatus>[0]['status'];
  statusReason: string | null;
}) => {
  const slug = flightPlanSlug.value;
  if (!slug) return;
  lifecycleSubmitting.value = true;
  resetLifecycleFeedback();
  try {
    await transitionFlightPlanStatus({
      auth: session.bearerToken,
      slug,
      status,
      statusReason,
    });
    await refreshPlan();
    lifecycleFeedback.value = 'Mission lifecycle status updated.';
    lifecycleFeedbackIsError.value = false;
  } catch (error: any) {
    lifecycleFeedback.value = resolveLifecycleError(
      error,
      'Unable to update mission lifecycle status.',
    );
    lifecycleFeedbackIsError.value = true;
  } finally {
    lifecycleSubmitting.value = false;
  }
};

const handleReopen = async ({ statusReason }: { statusReason: string }) => {
  const slug = flightPlanSlug.value;
  if (!slug) return;
  lifecycleSubmitting.value = true;
  resetLifecycleFeedback();
  try {
    await reopenFlightPlan({
      auth: session.bearerToken,
      slug,
      statusReason,
    });
    await refreshPlan();
    lifecycleFeedback.value = 'Mission reopened to pending.';
    lifecycleFeedbackIsError.value = false;
  } catch (error: any) {
    lifecycleFeedback.value = resolveLifecycleError(
      error,
      'Unable to reopen mission lifecycle status.',
    );
    lifecycleFeedbackIsError.value = true;
  } finally {
    lifecycleSubmitting.value = false;
  }
};

const handleCreateIteration = async ({
  title,
  eventDate,
}: {
  title?: string;
  eventDate?: string;
}) => {
  const slug = flightPlanSlug.value;
  if (!slug) return;
  lifecycleSubmitting.value = true;
  resetLifecycleFeedback();
  try {
    const nextPlan = await createFlightPlanIteration({
      auth: session.bearerToken,
      slug,
      payload: {
        title,
        eventDate,
      },
    });
    lifecycleFeedback.value = 'Next mission iteration created.';
    lifecycleFeedbackIsError.value = false;
    if (nextPlan.href) {
      await navigateTo(nextPlan.href);
      return;
    }
    await refreshPlan();
  } catch (error: any) {
    lifecycleFeedback.value = resolveLifecycleError(
      error,
      'Unable to create next mission iteration.',
    );
    lifecycleFeedbackIsError.value = true;
  } finally {
    lifecycleSubmitting.value = false;
  }
};

const handleDelete = async () => {
  if (!canDeleteMission.value || !flightPlanSlug.value) return;
  if (deleteSubmitting.value) return;
  if (process.client) {
    const confirmed = window.confirm(
      'Delete this mission? This removes the flight plan, tasks, comments, memberships, and gallery uploads.',
    );
    if (!confirmed) return;
  }
  deleteSubmitting.value = true;
  resetDeleteFeedback();
  try {
    await deleteFlightPlan({
      auth: session.bearerToken,
      slug: flightPlanSlug.value,
    });
    deleteFeedback.value = 'Mission deleted.';
    deleteFeedbackIsError.value = false;
    await navigateTo('/bridge/flight-plans');
  } catch (err: any) {
    deleteFeedback.value =
      err?.statusMessage || err?.data?.error || err?.message || 'Unable to delete mission.';
    deleteFeedbackIsError.value = true;
  } finally {
    deleteSubmitting.value = false;
  }
};

watch(
  () => plan.value?.isPublic,
  () => {
    planVisibilityLocal.value = Boolean(plan.value?.isPublic);
    planVisibilityFeedback.value = '';
    planVisibilityFeedbackIsError.value = false;
    planVisibilityTogglePending.value = false;
  },
  { immediate: true },
);

watch(
  () => plan.value?.crewCanPromotePassengers,
  () => {
    crewPromotionSettingLocal.value = Boolean(plan.value?.crewCanPromotePassengers);
    crewPromotionFeedback.value = '';
    crewPromotionFeedbackIsError.value = false;
    crewPromotionTogglePending.value = false;
  },
  { immediate: true },
);

watch(
  () => plan.value?.passengersCanCreateTasks,
  () => {
    passengerTaskSettingLocal.value = Boolean(plan.value?.passengersCanCreateTasks);
    passengerTaskFeedback.value = '';
    passengerTaskFeedbackIsError.value = false;
    passengerTaskTogglePending.value = false;
  },
  { immediate: true },
);

watch(
  () => plan.value?.publicContributions,
  () => {
    publicContributionsLocal.value = Boolean(plan.value?.publicContributions);
    publicContributionsFeedback.value = '';
    publicContributionsFeedbackIsError.value = false;
    publicContributionsTogglePending.value = false;
  },
  { immediate: true },
);

const handleEditSubmit = async (values: FlightPlanFormValues) => {
  const slug = flightPlanSlug.value;
  if (!slug) {
    resetEditFeedback();
    editFeedback.value = 'Flight plan unavailable.';
    editFeedbackIsError.value = true;
    return;
  }
  const title = values.title.trim();
  const bodyContent = editorStringToRichText(values.body);
  if (!title || bodyContent.length === 0) {
    editFeedback.value = 'Title and body are required.';
    editFeedbackIsError.value = true;
    return;
  }
  editSubmitting.value = true;
  resetEditFeedback();
  try {
    const payload: Record<string, unknown> = {
      title,
      body: bodyContent,
      summary: values.summary.trim() || null,
      location: values.location.trim() || null,
      category: values.category,
      eventDate: values.eventDate || null,
    };
    await runQueuedPlanWrite({
      payload,
      refreshMembers: true,
    });
    editFeedback.value = 'Mission updated.';
    editFeedbackIsError.value = false;
    showEditForm.value = false;
    editFormRef.value?.reset();
  } catch (err: any) {
    editFeedback.value = resolvePlanWriteErrorMessage(err, 'Unable to update mission.');
    editFeedbackIsError.value = true;
  } finally {
    editSubmitting.value = false;
  }
};

useHead(() => {
  const canonicalHref = canonicalPath.value
    ? `${requestURL.origin}${canonicalPath.value}`
    : null;

  return {
    title: plan.value ? `${plan.value.title} · Flight plans` : 'Flight plans',
    meta:
      plan.value?.summary && plan.value.summary.trim().length > 0
        ? [
            {
              name: 'description',
              content: plan.value.summary,
            },
          ]
        : [],
    link: canonicalHref
      ? [
          {
            rel: 'canonical',
            href: canonicalHref,
          },
        ]
      : [],
  };
});
</script>

<style scoped>
.flight-plan__state {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  align-items: center;
  justify-content: center;
  min-height: calc(var(--icon-size-px, var(--size-menu-object)) * 10);
  text-align: center;
}

.flight-plan__header-card {
  display: grid;
  gap: var(--space-sm);
}

.flight-plan__meta {
  margin: 0;
  color: var(--color-text-secondary);
}

.flight-plan__category {
  justify-self: flex-start;
}

.flight-plan__status-row {
  flex-wrap: wrap;
}

.flight-plan__lifecycle-panel {
  display: grid;
  gap: var(--space-sm);
}

.flight-plan__invite-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.flight-plan__invite-suggestions {
  list-style: none;
  padding: 0;
  margin: 0;
}

.flight-plan__invite-suggestions li + li {
  margin-top: var(--space-xs);
}

.flight-plan__collaboration-controls {
  padding: var(--space-sm) 0;
  border-top: var(--size-base-layout-px) solid rgba(255, 255, 255, 0.1);
  border-bottom: var(--size-base-layout-px) solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.flight-plan__crew-toggle {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.flight-plan__visibility-toggle {
  padding-bottom: var(--space-sm);
  border-bottom: var(--size-base-layout-px) solid rgba(255, 255, 255, 0.05);
  margin-bottom: var(--space-sm);
}

.flight-plan__crew-organiser-note {
  display: flex;
  flex-direction: column;
  gap: var(--crew-identity-gap);
  max-width: calc(var(--size-base-space-rem) * 42 * var(--size-scale-factor));
}

.flight-plan__crew-toggle-help {
  margin-top: var(--crew-identity-gap);
  max-width: calc(var(--size-base-space-rem) * 42 * var(--size-scale-factor));
}

.flight-plan__invite-suggestion-button {
  width: 100%;
  text-align: left;
  border: var(--size-base-layout-px) solid var(--color-border-weak);
  background: var(--color-surface-panel);
  border-radius: var(--radius-md);
  padding: calc(var(--size-base-space-rem) * 0.6 * var(--size-scale-factor)) var(--space-sm);
  display: flex;
  flex-direction: column;
  gap: calc(var(--size-base-space-rem) * 0.2 * var(--size-scale-factor));
  color: inherit;
  cursor: pointer;
}

.flight-plan__invite-suggestion-button:hover,
.flight-plan__invite-suggestion-button:focus-visible {
  border-color: var(--color-border-focus);
}

.flight-plan__invite-suggestion-slug {
  font-size: calc(var(--size-base-space-rem) * 0.85 * var(--size-scale-factor));
  color: var(--color-text-muted);
}

.flight-plan__actions {
  margin-top: var(--space-md);
  justify-content: flex-end;
}

.flight-plan__edit-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.flight-plan__member-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--space-sm);
}

.flight-plan__roster-groups {
  display: grid;
  gap: var(--space-lg);
}

.flight-plan__roster-group-title {
  margin: 0 0 var(--space-xs);
}

.flight-plan__member {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: calc(var(--size-base-space-rem) * 0.6 * var(--size-scale-factor));
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  border: var(--size-base-layout-px) solid rgba(159, 214, 245, 0.18);
  background: rgba(9, 20, 34, 0.55);
}

.flight-plan__member-primary {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.flight-plan__member-primary a {
  color: rgba(159, 214, 245, 0.95);
  text-decoration: none;
}

.flight-plan__member-primary a:hover,
.flight-plan__member-primary a:focus-visible {
  text-decoration: underline;
}

.flight-plan__member-secondary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  align-items: center;
}

.flight-plan__member-status {
  letter-spacing: var(--crew-identity-meta-letter-spacing);
  text-transform: uppercase;
}
</style>
