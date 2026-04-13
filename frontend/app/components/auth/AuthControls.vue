<template>
  <aside class="auth-flyout" id="auth-flyout" aria-label="Crew access">
    <div v-if="!sessionReady" class="auth-flyout__placeholder" aria-hidden="true" />
    <template v-else>
      <UiButton
        v-if="!isAuthenticated"
        type="button"
        @click="openAuthDialog"
      >
        Embark
      </UiButton>
      <UiButton
        v-else
        type="button"
        variant="secondary"
        :disabled="logoutPending"
        @click="handleLogout"
      >
        <span v-if="logoutPending">Disembarking…</span>
        <span v-else>Disembark</span>
      </UiButton>
    </template>

    <UiModal
      v-model="authDialogVisible"
      close-button-test-id="auth-dialog-close"
      close-aria-label="Close crew access dialog"
      class="auth-dialog"
    >
      <template #header>
        <UiHeading :level="3" size="h4">Embark</UiHeading>
      </template>
      <div class="auth-dialog__content" id="auth-dialog-content">
        <UiAlert class="auth-feedback" variant="info" layout="inline">
          <template v-if="!isResetMode">
            Enter your dispatch email and password to board the Astralpirates bridge.
          </template>
          <template v-else>
            Confirm your call sign and dispatch email. We only send reset links via email.
          </template>
        </UiAlert>
        <form v-if="!isResetMode" class="auth-form" @submit.prevent="submitLogin">
          <UiFormField label="Email" :required="true">
            <template #default="{ id, describedBy }">
              <UiTextInput
                ref="emailField"
                v-model.trim="loginForm.email"
                type="email"
                name="email"
                :id="id"
                :described-by="describedBy"
                autocomplete="username"
                required
              />
            </template>
          </UiFormField>
          <UiFormField label="Password" :required="true">
            <template #default="{ id, describedBy }">
              <UiTextInput
                v-model="loginForm.secret"
                type="password"
                name="password"
                :id="id"
                :described-by="describedBy"
                autocomplete="current-password"
                required
              />
            </template>
          </UiFormField>
          <UiAlert
            v-if="loginError"
            class="auth-feedback"
            variant="danger"
            layout="inline"
          >
            {{ loginError }}
          </UiAlert>
          <div class="auth-actions">
            <UiButton type="submit" :disabled="isSubmitting">
              <span v-if="isSubmitting">Embarking…</span>
              <span v-else>Embark</span>
            </UiButton>
            <UiButton type="button" variant="ghost" class="auth-forgot" @click="openPasswordReset">
              Forgot password?
            </UiButton>
            <UiButton
              type="button"
              variant="secondary"
              @click="closeAuthDialog"
            >
              Cancel
            </UiButton>
          </div>
        </form>
        <form v-else class="auth-form" @submit.prevent="submitPasswordReset">
          <div class="auth-grid">
            <UiFormField label="Name" :required="true">
              <template #default="{ id, describedBy }">
                <UiTextInput
                  v-model.trim="resetForm.firstName"
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
                  v-model.trim="resetForm.lastName"
                  :id="id"
                  :described-by="describedBy"
                  autocomplete="family-name"
                  required
                />
              </template>
            </UiFormField>
          </div>
          <UiFormField label="Call sign" :required="true">
            <template #default="{ id, describedBy }">
              <UiTextInput
                v-model.trim="resetForm.callSign"
                :id="id"
                :described-by="describedBy"
                autocomplete="nickname"
                required
              />
            </template>
          </UiFormField>
          <UiFormField label="Dispatch email" :required="true">
            <template #default="{ id, describedBy }">
              <UiTextInput
                v-model.trim="resetForm.email"
                :id="id"
                :described-by="describedBy"
                type="email"
                autocomplete="email"
                required
              />
            </template>
          </UiFormField>
          <UiAlert
            v-if="passwordResetMessage && passwordResetStatus === 'success'"
            class="auth-feedback"
            variant="success"
            layout="inline"
          >
            {{ passwordResetMessage }}
          </UiAlert>
          <UiAlert
            v-else-if="passwordResetError"
            class="auth-feedback"
            variant="danger"
            layout="inline"
          >
            {{ passwordResetError }}
          </UiAlert>
          <div class="auth-actions">
            <UiButton type="submit" :disabled="isResetSubmitting">
              <span v-if="isResetSubmitting">Sending…</span>
              <span v-else>Send reset link</span>
            </UiButton>
            <UiButton type="button" variant="secondary" @click="closePasswordReset">
              Back to login
            </UiButton>
          </div>
        </form>
      </div>
    </UiModal>
  </aside>
</template>

<script setup lang="ts">
import { useAuthDialog } from '~/composables/useAuthDialog';
import { UiAlert, UiButton, UiFormField, UiHeading, UiModal, UiTextInput } from '~/components/ui';

const {
  authDialogVisible,
  emailField,
  isAuthenticated,
  loginForm,
  loginError,
  isSubmitting,
  logoutPending,
  sessionReady,
  openAuthDialog,
  closeAuthDialog,
  submitLogin,
  handleLogout,
  isResetMode,
  openPasswordReset,
  closePasswordReset,
  submitPasswordReset,
  resetForm,
  passwordResetStatus,
  passwordResetMessage,
  passwordResetError,
  isResetSubmitting,
} = useAuthDialog();

defineExpose({ openAuthDialog });
</script>

<style scoped>
:global(.auth-dialog.ui-modal) {
  --auth-dialog-panel-max-width: calc(var(--size-base-layout-px) * 420);
  --auth-dialog-panel-inline-gap: var(--space-xl);
  --auth-dialog-panel-compact-inline-gap: var(--space-lg);
  --auth-dialog-panel-border-width: var(--size-base-layout-px);
  background: var(--color-surface-overlay);
}

:global(.auth-dialog .ui-modal__panel) {
  width: min(var(--auth-dialog-panel-max-width), calc(100% - var(--auth-dialog-panel-inline-gap)));
  background: var(--color-surface-dialog);
  border: var(--auth-dialog-panel-border-width) solid var(--color-border-weak);
  box-shadow: var(--shadow-overlay);
}

:global(.auth-dialog .ui-modal__body) {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.auth-flyout {
  --auth-flyout-offset: var(--clip-top);
  --auth-flyout-gap: var(--space-sm);
  --auth-flyout-blur: calc(var(--size-base-layout-px) * 8);
  --auth-form-gap: var(--space-md);
  --auth-grid-min-column: calc(var(--size-base-layout-px) * 180);
  --auth-forgot-padding-inline: var(--space-xs);
  --auth-feedback-margin-bottom: var(--space-md);
  --auth-placeholder-width: calc(var(--size-base-layout-px) * 120);
  --auth-placeholder-height: var(--size-avatar-xs);
  --auth-placeholder-border-width: var(--size-base-layout-px);

  position: fixed;
  bottom: var(--auth-flyout-offset);
  right: var(--auth-flyout-offset);
  z-index: 2100;
  display: flex;
  gap: var(--auth-flyout-gap);
  flex-wrap: wrap;
  justify-content: flex-end;
}

.auth-flyout :deep(.ui-button) {
  backdrop-filter: blur(var(--auth-flyout-blur));
  background: var(--color-surface-overlay);
  border-color: var(--color-border-weak);
}

.auth-dialog__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.auth-form {
  display: grid;
  gap: var(--auth-form-gap);
}

.auth-grid {
  display: grid;
  gap: var(--space-sm);
  grid-template-columns: repeat(auto-fit, minmax(var(--auth-grid-min-column), 1fr));
}

.auth-actions {
  display: flex;
  gap: var(--auth-form-gap);
  justify-content: space-between;
}

.auth-actions :deep(.ui-button) {
  flex: 1;
  justify-content: center;
}

.auth-actions :deep(.auth-forgot) {
  flex: 0 0 auto;
  padding-inline: var(--auth-forgot-padding-inline);
}

.auth-feedback {
  margin-bottom: var(--auth-feedback-margin-bottom);
}

.auth-flyout__placeholder {
  width: var(--auth-placeholder-width);
  height: var(--auth-placeholder-height);
  border-radius: var(--radius-md);
  border: var(--auth-placeholder-border-width) solid var(--color-border-weak);
  background: var(--color-surface-base);
  animation: auth-placeholder-pulse 1.4s ease-in-out infinite;
}

@keyframes auth-placeholder-pulse {
  0% {
    opacity: 0.5;
  }
  50% {
    opacity: 0.9;
  }
  100% {
    opacity: 0.5;
  }
}

@media (--bp-max-compact) {
  :global(.auth-dialog .ui-modal__panel) {
    width: calc(100% - var(--auth-dialog-panel-compact-inline-gap));
  }
  .auth-actions {
    flex-direction: column;
  }
  .auth-actions :deep(.ui-button) {
    width: 100%;
  }
}
</style>
