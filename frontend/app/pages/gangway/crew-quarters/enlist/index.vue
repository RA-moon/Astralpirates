<template>
  <section class="container page page-enlist" data-enlist-root>
    <header class="page-header">
      <UiHeading :level="1">Enlist a friend</UiHeading>
      <UiText class="tagline">Spend one E.L.S.A. to invite a new pirate aboard.</UiText>
    </header>

    <UiSurface variant="panel" data-enlist-card>
      <UiText class="enlist-balance">
        E.L.S.A. reserves:
        <strong data-enlist-elsa>{{ elsaBalance }}</strong>
      </UiText>

      <UiAlert
        v-if="feedback"
        :variant="feedbackIsError ? 'danger' : 'success'"
        layout="inline"
      >
        {{ feedback }}
      </UiAlert>

      <UiAlert v-if="!isAuthenticated" variant="info" class="enlist-callout">
        <template #default>
          <UiText>You need to log in before spending an E.L.S.A.</UiText>
          <UiText>Use the Embark button in the navigation to enter the crew quarter.</UiText>
        </template>
      </UiAlert>

      <form
        v-else-if="!hasInvite"
        class="enlist-form"
        data-enlist-form
        @submit.prevent="submitInvite"
      >
        <div class="enlist-form__grid">
          <UiFormField label="Name" :required="true">
            <template #default="{ id, describedBy }">
              <UiTextInput
                v-model.trim="form.firstName"
                :id="id"
                :described-by="describedBy"
                autocomplete="given-name"
                required
              />
            </template>
          </UiFormField>
          <UiFormField label="Surname" :required="true">
            <template #default="{ id, describedBy }">
              <UiTextInput
                v-model.trim="form.lastName"
                :id="id"
                :described-by="describedBy"
                autocomplete="family-name"
                required
              />
            </template>
          </UiFormField>
          <UiFormField label="Email" :required="true">
            <template #default="{ id, describedBy }">
              <UiTextInput
                v-model.trim="form.email"
                :id="id"
                :described-by="describedBy"
                type="email"
                autocomplete="email"
                required
              />
            </template>
          </UiFormField>
        </div>
        <UiText variant="muted" class="enlist-form__note">
          Submitting will spend one E.L.S.A. from your balance.
        </UiText>
        <UiInline class="enlist-form__actions" :gap="'var(--space-sm)'">
          <UiButton type="submit" :loading="isSubmitting">
            Enlist
          </UiButton>
          <UiButton type="button" variant="ghost" @click="() => resetForm()" :disabled="isSubmitting">
            Reset
          </UiButton>
        </UiInline>
      </form>

      <UiSurface
        v-else
        class="enlist-success"
        data-enlist-success
        variant="panel"
        borderless
      >
        <UiHeading :level="2" size="h4" :uppercase="false">
          <template v-if="inviteLockedByReset">Password reset link sent</template>
          <template v-else>Invite dispatched</template>
        </UiHeading>
        <UiText class="enlist-success__message">
          <template v-if="inviteLockedByReset">
            We emailed the secure reset link to <strong>{{ inviteEmail || 'your dispatch inbox' }}</strong>.
            Finish the reset to free your invite slot.
          </template>
          <template v-else>
            We emailed the enlistment link directly to
            <strong>{{ inviteEmail || 'your recruit' }}</strong>. Links never appear on this page.
          </template>
        </UiText>
        <UiText v-if="inviteSentAt" class="enlist-success__sent">
          Sent {{ inviteSentAt }}
        </UiText>
        <UiText v-if="inviteExpiry" class="enlist-success__expiry" data-enlist-success-expiry>
          Expires {{ inviteExpiry }}
        </UiText>
        <UiText class="enlist-success__note">
          <template v-if="inviteLockedByReset">
            No longer need this reset? Cancel below to reclaim your invite slot immediately.
          </template>
          <template v-else>
            Need to resend? Cancel the enlistment below to free your slot.
          </template>
        </UiText>
        <UiInline class="enlist-form__actions enlist-success__actions" :gap="'var(--space-sm)'">
          <UiLinkButton variant="secondary" data-enlist-return to="/gangway/crew-quarters">
            Back to crew quarters
          </UiLinkButton>
          <UiButton type="button" variant="ghost" @click="cancelInvite" :loading="isSubmitting">
            Cancel invite
          </UiButton>
        </UiInline>
      </UiSurface>
    </UiSurface>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useInvitationsStore } from '~/stores/invitations';
import { useSessionStore } from '~/stores/session';
import { useInviteStatus } from '~/composables/useInviteStatus';
import { useFeedback } from '~/composables/useFeedback';
import {
  UiAlert,
  UiButton,
  UiFormField,
  UiHeading,
  UiInline,
  UiLinkButton,
  UiSurface,
  UiText,
  UiTextInput,
} from '~/components/ui';

const session = useSessionStore();
const invitations = useInvitationsStore();
const {
  elsaBalance,
  hasInvite,
  inviteEmail,
  inviteExpiry,
  inviteSentAt,
  hydrateStatus,
  cancelInvite: cancelInviteRequest,
  requestInvite,
  onStatusUpdate,
  invitePurpose,
} = useInviteStatus();
const inviteLockedByReset = computed(() => invitePurpose.value === 'password_reset');

const form = reactive({
  firstName: '',
  lastName: '',
  email: '',
});

const isSubmitting = ref(false);
const { message: feedback, isError: feedbackIsError, setFeedback, clearFeedback } = useFeedback();

const isAuthenticated = computed(() => session.isAuthenticated);

const resetForm = ({ clearMessages = true }: { clearMessages?: boolean } = {}) => {
  form.firstName = '';
  form.lastName = '';
  form.email = '';
  if (clearMessages) {
    clearFeedback();
  }
};

const loadInviteStatus = async (silent = true) => {
  if (!session.isAuthenticated) {
    invitations.reset();
    return;
  }
  try {
    const result = await hydrateStatus({ silent });
    if (!result.ok) {
      setFeedback(result.message, true);
    } else {
      clearFeedback();
    }
  } catch (err) {
    if (process.dev) {
      // eslint-disable-next-line no-console
      console.warn('[enlist] failed to load invite status', err);
    }
    if (!silent) {
      setFeedback('Unable to load invite status. Please try again.', true);
    }
  }
};

const submitInvite = async () => {
  if (!form.firstName || !form.lastName || !form.email) {
    setFeedback('Fill in every field before enlisting.', true);
    return;
  }

  isSubmitting.value = true;
  clearFeedback();

  const result = await requestInvite({
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
  });
  setFeedback(result.message, !result.ok);
  isSubmitting.value = false;
  if (result.ok) {
    resetForm({ clearMessages: false });
  }
};

const cancelInvite = async () => {
  isSubmitting.value = true;
  clearFeedback();
  const result = await cancelInviteRequest();
  setFeedback(result.message, !result.ok);
  isSubmitting.value = false;
  loadInviteStatus();
};

watch(
  () => session.isAuthenticated,
  (authenticated) => {
    if (authenticated) {
      loadInviteStatus(false);
    } else {
      invitations.reset();
    }
  },
  { immediate: true },
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
</script>

<style scoped src="~/styles/profile-page.css"></style>

<style scoped>
.enlist-balance {
  font-size: calc(var(--size-base-space-rem) * 1.1);
  letter-spacing: calc(var(--crew-identity-meta-letter-spacing) * 0.625);
  text-transform: uppercase;
}

.enlist-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  margin-top: var(--space-lg);
}

.enlist-form__grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(
    auto-fit,
    minmax(calc(var(--size-base-layout-px) * 220 * var(--size-scale-factor)), 1fr)
  );
}

.enlist-form__note {
  margin: 0;
}

.enlist-form__actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.enlist-callout {
  margin-top: var(--space-md);
  display: grid;
  gap: var(--space-xs);
}

.enlist-success {
  margin-top: var(--space-lg);
  display: grid;
  gap: var(--space-sm);
}

.enlist-success__recipient,
.enlist-success__sent,
.enlist-success__expiry,
.enlist-success__note {
  margin: 0;
}

.enlist-success__note {
  color: var(--color-text-muted);
}
</style>
