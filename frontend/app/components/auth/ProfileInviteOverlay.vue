<template>
  <UiModal
    v-model="isOpen"
    class="profile-invite-modal"
    close-aria-label="Close enlist overlay"
    close-on-backdrop
  >
    <template #header>
      <UiHeading :level="3" size="h4">Enlist reinforcements</UiHeading>
    </template>
    <p class="profile-invite-warning">Be mindful who you invite into the crew!</p>
    <p class="profile-invite-summary">
      Inviting a friend will cost <strong>1 E.L.S.A.</strong> from your reserves.
    </p>
    <p class="profile-card__invite-note">Each enlistment spends one E.L.S.A.</p>
    <p class="profile-invite-balance">
      Current balance: <span>{{ elsaBalance }}</span>
    </p>
    <UiAlert
      v-if="feedback"
      class="profile-card__invite-feedback"
      :variant="feedbackIsError ? 'danger' : 'success'"
      layout="inline"
    >
      {{ feedback }}
    </UiAlert>
    <div v-if="overlayLoading" class="profile-card__invite-share">
      <p>Checking invite status…</p>
    </div>
    <template v-else>
      <div v-if="hasInvite" class="profile-card__invite-share">
        <p class="profile-card__invite-note">
          We emailed the enlistment link directly to your recruit—links never appear inside the site.
        </p>
        <p v-if="inviteEmail" class="profile-card__invite-recipient">{{ inviteEmail }}</p>
        <p v-if="inviteSentAt" class="profile-card__invite-expiry">Sent {{ inviteSentAt }}</p>
        <p v-if="inviteExpiry" class="profile-card__invite-expiry">Expires {{ inviteExpiry }}</p>
      </div>
      <div v-else class="profile-card__invite-share">
        <p>No active enlistment is in flight.</p>
        <p>Spend an E.L.S.A. to raise a new recruit.</p>
      </div>
    </template>
    <div class="profile-invite-actions">
      <UiButton type="button" variant="secondary" @click="closeOverlay">
        Close
      </UiButton>
      <UiButton
        v-if="hasInvite"
        type="button"
        :disabled="isProcessing"
        @click="cancelCurrentInvite"
      >
        <span v-if="isProcessing">Cancelling…</span>
        <span v-else>Cancel invite</span>
      </UiButton>
      <UiButton v-else type="button" @click="openEnlistPage">
        Open enlist page
      </UiButton>
    </div>
  </UiModal>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from '#app';
import { useInviteStatus } from '~/composables/useInviteStatus';
import { useSessionStore } from '~/stores/session';
import { useModalPresence } from '~/composables/useModalPresence';
import { useFeedback } from '~/composables/useFeedback';
import { requestAuthDialog } from '~/composables/useAuthDialog';
import { UiAlert, UiButton, UiHeading, UiModal } from '~/components/ui';

const router = useRouter();
const session = useSessionStore();

const {
  error,
  elsaBalance,
  hasInvite,
  inviteEmail,
  inviteExpiry,
  inviteSentAt,
  isLoading,
  hydrateStatus,
  cancelInvite,
  onStatusUpdate,
} = useInviteStatus();

const { isOpen, open, close } = useModalPresence({
  lockScroll: true,
  closeOnEscape: true,
});

const { message: feedback, isError: feedbackIsError, setFeedback, clearFeedback } = useFeedback();
const isProcessing = ref(false);
const overlayLoading = computed(() => isLoading.value && !isProcessing.value);

const hydrateAndReport = async () => {
  const result = await hydrateStatus({ silent: false });
  if (!result.ok) {
    setFeedback(result.message, true);
  } else if (!error.value) {
    clearFeedback();
  }
};

const cancelCurrentInvite = async () => {
  if (!hasInvite.value) return;
  isProcessing.value = true;
  clearFeedback();
  const result = await cancelInvite();
  setFeedback(result.message, !result.ok);
  isProcessing.value = false;
  hydrateAndReport();
};

const openEnlistPage = () => {
  close();
  router.push('/gangway/crew-quarters/enlist');
};

const closeOverlay = () => {
  close();
};

const openOverlay = () => {
  if (!session.isAuthenticated) {
    requestAuthDialog();
    return;
  }
  clearFeedback();
  open();
};

watch(isOpen, (visible) => {
  if (visible) {
    hydrateAndReport();
  } else {
    clearFeedback();
    isProcessing.value = false;
  }
});

watch(
  () => session.isAuthenticated,
  (authenticated) => {
    if (!authenticated && isOpen.value) {
      closeOverlay();
    }
  },
);

onStatusUpdate(({ status: nextStatus, error: nextError }) => {
  if (nextError) {
    setFeedback(nextError, true);
    return;
  }
  if (nextStatus === 'ready') {
    clearFeedback();
  }
});

defineExpose({ open: openOverlay, close: closeOverlay });
</script>

<style scoped src="~/styles/profile-page.css"></style>
