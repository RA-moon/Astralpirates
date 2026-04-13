<template>
  <section class="container page page-enlist-accept" data-enlist-accept-root>
    <header class="page-header">
      <UiHeading :level="1">{{ pageHeading }}</UiHeading>
      <UiText class="tagline">{{ pageDescription }}</UiText>
    </header>

    <UiSurface variant="panel" class="enlist-accept-card">
      <UiAlert
        v-if="feedback"
        :variant="feedbackIsError ? 'danger' : 'success'"
        layout="inline"
      >
        {{ feedback }}
      </UiAlert>

      <div v-if="loading" class="enlist-accept-state">
        <UiText>Checking your invitation token…</UiText>
      </div>

      <div v-else-if="inviteInvalid">
        <UiHeading :level="2" size="h4" :uppercase="false">Invite unavailable</UiHeading>
        <UiText>This invitation link is invalid or has expired. Ask your inviter to share a new enlistment link.</UiText>
      </div>

      <div v-else-if="completed" class="enlist-accept-state">
        <UiHeading :level="2" size="h4" :uppercase="false">{{ completionHeading }}</UiHeading>
        <UiText>{{ completionMessage }}</UiText>
        <UiInline class="enlist-accept-actions" :gap="'var(--space-sm)'">
          <UiLinkButton to="/gangway/crew-quarters">Enter crew quarters</UiLinkButton>
        </UiInline>
      </div>

      <form v-else class="enlist-accept-form" @submit.prevent="submitRegistration">
        <UiText
          v-if="inviteLoaded"
          class="enlist-accept-helper enlist-accept-note"
          data-invite-summary
        >
          <template v-if="isPasswordResetToken">
            Enter your dispatch email and name to confirm this reset. We never display reset links.
          </template>
          <template v-else>
            Invitation issued to
            <strong>
              {{ inviteName || 'this crew member' }}
              <template v-if="inviteEmail">({{ inviteEmail }})</template>
            </strong>
            . Enter the same details below so we can confirm this enlistment.
          </template>
        </UiText>

        <div class="enlist-accept-grid">
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
        </div>

        <UiFormField v-if="!isPasswordResetToken" label="Call sign" :required="true">
          <template #default="{ id, describedBy }">
            <UiTextInput
              v-model.trim="form.callSign"
              :id="id"
              :described-by="describedBy"
              autocomplete="nickname"
              required
            />
          </template>
        </UiFormField>
        <UiText
          v-if="!isPasswordResetToken"
          class="enlist-accept-helper"
          :class="{
            'enlist-accept-helper--success': callSignState.available === true,
            'enlist-accept-helper--error': callSignState.available === false,
          }"
        >
          <span v-if="callSignState.checking">Checking availability…</span>
          <span v-else-if="callSignState.message">{{ callSignState.message }}</span>
          <span v-else>Pick a unique call sign. It becomes your crew slug.</span>
          <span v-if="callSignState.suggestion" class="enlist-accept-helper-suggestion">
            Try “{{ callSignState.suggestion }}”
          </span>
        </UiText>

        <div class="enlist-accept-passwords">
          <UiFormField label="Password" :required="true">
            <template #default="{ id, describedBy }">
              <UiPasswordInput
                v-model="form.password"
                :id="id"
                :described-by="describedBy"
                autocomplete="new-password"
                minlength="8"
                required
              />
            </template>
          </UiFormField>
          <UiFormField label="Confirm password" :required="true">
            <template #default="{ id, describedBy }">
              <UiPasswordInput
                v-model="form.confirmPassword"
                :id="id"
                :described-by="describedBy"
                autocomplete="new-password"
                minlength="8"
                required
              />
            </template>
          </UiFormField>
        </div>

        <UiInline class="enlist-accept-actions" :gap="'var(--space-sm)'">
          <UiButton type="submit" :loading="isSubmitting">
            {{ submitCta }}
          </UiButton>
        </UiInline>
      </form>
    </UiSurface>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from '#app';
import { getRequestFetch } from '~/modules/api';
import { useFeedback } from '~/composables/useFeedback';
import { useSessionStore } from '~/stores/session';
import {
  UiAlert,
  UiButton,
  UiFormField,
  UiHeading,
  UiInline,
  UiLinkButton,
  UiPasswordInput,
  UiSurface,
  UiText,
  UiTextInput,
} from '~/components/ui';

type RegisterPrefill = {
  email: string;
  firstName: string;
  lastName: string;
};

const route = useRoute();
const router = useRouter();
const requestFetch = getRequestFetch();
const session = useSessionStore();

const token = computed(() => {
  const raw = route.query.token;
  if (Array.isArray(raw)) {
    return raw[0] ? String(raw[0]) : '';
  }
  return raw ? String(raw) : '';
});

const loading = ref(false);
const inviteInvalid = ref(false);
const inviteLoaded = ref(false);
const completed = ref(false);
const isSubmitting = ref(false);
const tokenPurpose = ref<'recruit' | 'password_reset'>('recruit');
const isPasswordResetToken = computed(() => tokenPurpose.value === 'password_reset');
const pageHeading = computed(() =>
  isPasswordResetToken.value ? 'Reset your password' : 'Join the crew',
);
const pageDescription = computed(() =>
  isPasswordResetToken.value
    ? 'Confirm your dispatch details and choose a new password.'
    : 'Complete your enlistment by choosing a call sign and password.',
);
const submitCta = computed(() =>
  isPasswordResetToken.value ? 'Save new password' : 'Join the crew',
);
const completionHeading = computed(() =>
  isPasswordResetToken.value ? 'Password updated' : 'Welcome aboard!',
);
const completionMessage = computed(() =>
  isPasswordResetToken.value
    ? 'Your account is ready. Head to the crew quarters to begin your voyage with the new password.'
    : 'Your account is ready. Head to the crew quarters to begin your voyage.',
);

const expected = reactive<RegisterPrefill>({
  email: '',
  firstName: '',
  lastName: '',
});

const form = reactive({
  email: '',
  firstName: '',
  lastName: '',
  callSign: '',
  password: '',
  confirmPassword: '',
});

const resetFormFields = () => {
  form.email = '';
  form.firstName = '';
  form.lastName = '';
  form.callSign = '';
  form.password = '';
  form.confirmPassword = '';
};

const { message: feedback, isError: feedbackIsError, setFeedback, clearFeedback } = useFeedback();

const callSignState = reactive({
  checking: false,
  available: null as boolean | null,
  message: '',
  suggestion: null as string | null,
  lastChecked: '',
});

let availabilityTimeout: ReturnType<typeof setTimeout> | null = null;
let availabilityRunId = 0;

const sanitizeCallSignInput = (value: string) => value.trim().replace(/\s+/g, ' ');

const resetCallSignState = () => {
  callSignState.checking = false;
  callSignState.available = null;
  callSignState.message = '';
  callSignState.suggestion = null;
};

const performCallSignCheck = async (rawValue: string) => {
  const value = sanitizeCallSignInput(rawValue);
  if (!value) {
    callSignState.checking = false;
    resetCallSignState();
    callSignState.lastChecked = '';
    return;
  }

  const checkId = ++availabilityRunId;
  callSignState.checking = true;

  try {
    const response: any = await requestFetch(
      `/api/callsigns/availability?value=${encodeURIComponent(value)}`,
      {
        method: 'GET',
      },
    );
    if (availabilityRunId !== checkId) return;
    callSignState.available = response?.available === true;
    callSignState.message = callSignState.available
      ? 'Call sign is available.'
      : response?.error ?? '';
    callSignState.suggestion = response?.suggestion ?? null;
    callSignState.lastChecked = value.toLowerCase();
  } catch (error: any) {
    if (availabilityRunId !== checkId) return;
    const status = Number.parseInt(error?.response?.status ?? error?.statusCode ?? '', 10) || null;
    const data = error?.data ?? error?.response?._data ?? {};
    if (status === 409) {
      callSignState.available = false;
      callSignState.message = data?.error ?? 'That call sign is already taken.';
      callSignState.suggestion = data?.suggestion ?? null;
      callSignState.lastChecked = sanitizeCallSignInput(
        (data?.callSign as string | undefined) ?? value,
      ).toLowerCase();
    } else if (status === 400) {
      callSignState.available = false;
      callSignState.message = data?.error ?? 'Call sign is invalid.';
      callSignState.suggestion = null;
      callSignState.lastChecked = value.toLowerCase();
    } else {
      callSignState.available = null;
      callSignState.message =
        data?.error || error?.message || 'Unable to verify call sign availability.';
      callSignState.suggestion = null;
      callSignState.lastChecked = value.toLowerCase();
    }
  } finally {
    if (availabilityRunId === checkId) {
      callSignState.checking = false;
    }
  }
};

const ensureCallSignAvailable = async () => {
  if (isPasswordResetToken.value) {
    return true;
  }
  const value = sanitizeCallSignInput(form.callSign);
  if (!value) {
    setFeedback('Choose a call sign to continue.', true);
    return false;
  }

  if (availabilityTimeout) {
    clearTimeout(availabilityTimeout);
    availabilityTimeout = null;
  }

  if (callSignState.available === true && callSignState.lastChecked === value.toLowerCase()) {
    return true;
  }

  await performCallSignCheck(value);

  if (callSignState.available === true && callSignState.lastChecked === value.toLowerCase()) {
    return true;
  }

  if (callSignState.message) {
    setFeedback(callSignState.message, true);
  } else {
    setFeedback('Call sign must be available before you can enlist.', true);
  }
  return false;
};

const normalizeName = (value: string) => value.trim().replace(/\s+/g, ' ');

const loadInviteDetails = async () => {
  if (!token.value) {
    inviteInvalid.value = true;
    inviteLoaded.value = false;
    resetFormFields();
    resetCallSignState();
    callSignState.lastChecked = '';
    setFeedback('This invitation link is missing its token. Ask your inviter for a new link.', true);
    return;
  }

  if (availabilityTimeout) {
    clearTimeout(availabilityTimeout);
    availabilityTimeout = null;
  }

  loading.value = true;
  inviteInvalid.value = false;
  inviteLoaded.value = false;
  clearFeedback();

  try {
    const response: any = await requestFetch(`/api/auth/register/${token.value}`, {
      method: 'GET',
    });

    tokenPurpose.value = response?.purpose === 'password_reset' ? 'password_reset' : 'recruit';
    const email = typeof response?.email === 'string' ? response.email.trim().toLowerCase() : '';
    const firstName =
      typeof response?.firstName === 'string' ? normalizeName(response.firstName) : '';
    const lastName =
      typeof response?.lastName === 'string' ? normalizeName(response.lastName) : '';

    if (!email) {
      inviteInvalid.value = true;
      setFeedback('This invitation link is invalid or has expired.', true);
      return;
    }

    expected.email = email;
    expected.firstName = firstName;
    expected.lastName = lastName;

    resetFormFields();
    resetCallSignState();
    callSignState.lastChecked = '';
    inviteLoaded.value = true;
  } catch (error: any) {
    inviteInvalid.value = true;
    inviteLoaded.value = false;
    resetFormFields();
    resetCallSignState();
    callSignState.lastChecked = '';
    const message =
      error?.data?.error ||
      error?.response?._data?.error ||
      error?.message ||
      'This invitation link is invalid or has expired.';
    setFeedback(message, true);
  } finally {
    loading.value = false;
  }
};

watch(
  () => form.callSign,
  (value) => {
    if (isPasswordResetToken.value) {
      if (availabilityTimeout) {
        clearTimeout(availabilityTimeout);
        availabilityTimeout = null;
      }
      resetCallSignState();
      return;
    }
    if (availabilityTimeout) {
      clearTimeout(availabilityTimeout);
    }
    resetCallSignState();
    if (!value?.trim()) {
      callSignState.checking = false;
      callSignState.lastChecked = '';
      return;
    }
    availabilityTimeout = setTimeout(() => {
      performCallSignCheck(value);
    }, 400);
  },
);

watch(
  () => token.value,
  (next, previous) => {
    if (next !== previous) {
      loadInviteDetails();
    }
  },
);

const inviteName = computed(() => {
  const parts = [expected.firstName?.trim(), expected.lastName?.trim()].filter(
    (segment) => segment && segment.length > 0,
  );
  return parts.join(' ').trim();
});

const inviteEmail = computed(() => expected.email);

const validateForm = () => {
  if (!inviteLoaded.value) {
    setFeedback('We could not confirm this invitation. Refresh the link and try again.', true);
    return false;
  }

  if (!form.email || !form.firstName || !form.lastName || !form.password || !form.confirmPassword) {
    setFeedback('Fill in every field before joining the crew.', true);
    return false;
  }

  if (!isPasswordResetToken.value && !form.callSign) {
    setFeedback('Choose a call sign before you can enlist.', true);
    return false;
  }

  const emailMatches = form.email.trim().toLowerCase() === expected.email;
  if (!emailMatches) {
    setFeedback('Email must match the address your inviter submitted.', true);
    return false;
  }

  if (expected.firstName) {
    const firstMatches =
      normalizeName(form.firstName).toLowerCase() === expected.firstName.toLowerCase();
    if (!firstMatches) {
      setFeedback('First name must match the invitation exactly.', true);
      return false;
    }
  }

  if (expected.lastName) {
    const lastMatches =
      normalizeName(form.lastName).toLowerCase() === expected.lastName.toLowerCase();
    if (!lastMatches) {
      setFeedback('Surname must match the invitation exactly.', true);
      return false;
    }
  }

  if (form.password.length < 8) {
    setFeedback('Password must be at least 8 characters long.', true);
    return false;
  }

  if (form.password !== form.confirmPassword) {
    setFeedback('Passwords do not match. Enter the same password twice.', true);
    return false;
  }

  return true;
};

const submitRegistration = async () => {
  if (isSubmitting.value) return;
  clearFeedback();

  if (!validateForm()) {
    return;
  }

  if (!isPasswordResetToken.value) {
    const callSignReady = await ensureCallSignAvailable();
    if (!callSignReady) {
      return;
    }
  }

  if (!token.value) {
    setFeedback('Invitation token is missing. Ask your inviter to send a new link.', true);
    return;
  }

  isSubmitting.value = true;

  try {
    const response: any = await requestFetch(`/api/auth/register/${token.value}`, {
      method: 'POST',
      body: {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        callSign: form.callSign,
        password: form.password,
        confirmPassword: form.confirmPassword,
      },
    });

    if (response?.token && response?.user) {
      session.setSession({
        token: response.token,
        user: response.user,
        exp: response?.exp ? String(response.exp) : null,
        expiresAt: typeof response?.expiresAt === 'string' ? response.expiresAt : null,
      } as any);
    }

    completed.value = true;
    setFeedback(
      isPasswordResetToken.value
        ? 'Password updated. Redirecting to the bridge profile…'
        : 'Registration successful. Redirecting to the bridge profile…',
      false,
    );

    const destination =
      response?.user?.profileSlug && typeof response.user.profileSlug === 'string'
        ? '/bridge'
        : '/gangway/crew-quarters';
    await router.push(destination);
  } catch (error: any) {
    const status = Number.parseInt(error?.response?.status ?? error?.statusCode ?? '', 10) || null;
    const message =
      error?.data?.error ||
      error?.response?._data?.error ||
      error?.statusMessage ||
      error?.message ||
      (status === 409 ? 'That call sign or email is already taken.' : 'Unable to complete registration.');
    setFeedback(message, true);
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(() => {
  loadInviteDetails();
});

onBeforeUnmount(() => {
  if (availabilityTimeout) {
    clearTimeout(availabilityTimeout);
  }
});
</script>

<style scoped>
.enlist-accept-card {
  display: grid;
  gap: var(--space-lg);
}

.enlist-accept-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.enlist-accept-grid {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(
    auto-fit,
    minmax(calc(var(--size-base-layout-px) * 220 * var(--size-scale-factor)), 1fr)
  );
}

.enlist-accept-helper {
  margin: 0;
  font-size: calc(var(--size-base-space-rem) * 0.9);
  color: var(--color-text-muted);
}

.enlist-accept-helper--success {
  color: var(--color-success);
}

.enlist-accept-helper--error {
  color: var(--color-danger);
}

.enlist-accept-helper-suggestion {
  display: block;
  font-style: italic;
  margin-top: var(--space-2xs);
}

.enlist-accept-passwords {
  display: grid;
  gap: var(--space-md);
  grid-template-columns: repeat(
    auto-fit,
    minmax(calc(var(--size-base-layout-px) * 220 * var(--size-scale-factor)), 1fr)
  );
}

.enlist-accept-actions {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.enlist-accept-state {
  display: grid;
  gap: var(--space-sm);
}
</style>
