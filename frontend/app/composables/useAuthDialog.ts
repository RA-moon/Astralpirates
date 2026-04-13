import { computed, inject, nextTick, provide, reactive, ref, watch } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useRouter } from '#app';
import { useSessionStore } from '~/stores/session';
import { usePasswordResetStore } from '~/stores/auth/passwordReset';
import { useModalPresence } from '~/composables/useModalPresence';

const AuthDialogControllerKey = Symbol('AuthDialogController');
export interface AuthDialogController {
  authDialogVisible: Ref<boolean>;
  isAuthenticated: ComputedRef<boolean>;
  sessionReady: ComputedRef<boolean>;
  openAuthDialog: () => void;
  closeAuthDialog: () => void;
  submitLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
  loginError: Ref<string>;
  isSubmitting: Ref<boolean>;
  logoutPending: Ref<boolean>;
  isResetMode: Ref<boolean>;
  openPasswordReset: () => void;
  closePasswordReset: () => void;
  submitPasswordReset: () => Promise<void>;
  passwordResetStatus: ComputedRef<string>;
  passwordResetMessage: ComputedRef<string | null>;
  passwordResetError: ComputedRef<string | null>;
  isResetSubmitting: ComputedRef<boolean>;
}

type FocusTarget = { focus: () => void } | HTMLInputElement | null;

export interface AuthDialogContext extends AuthDialogController {
  emailField: Ref<FocusTarget>;
  loginForm: { email: string; secret: string };
  resetForm: { firstName: string; lastName: string; callSign: string; email: string };
}

let singletonController: AuthDialogContext | null = null;

export const useAuthDialog = () => {
  const session = useSessionStore();
  const router = useRouter();

  if (singletonController) {
    provide(AuthDialogControllerKey, singletonController);
    return singletonController;
  }

  const loginForm = reactive({
    email: '',
    secret: '',
  });

  const passwordReset = usePasswordResetStore();
  const resetMode = ref(false);
  const resetForm = reactive({
    firstName: '',
    lastName: '',
    callSign: '',
    email: '',
  });
  const localResetError = ref<string | null>(null);

  const loginError = ref('');
  const isSubmitting = ref(false);
  const logoutPending = ref(false);
  const emailField = ref<FocusTarget>(null);

  const passwordResetStatus = computed(() => passwordReset.status);
  const passwordResetMessage = computed(() => passwordReset.message ?? null);
  const passwordResetError = computed(
    () => localResetError.value ?? passwordReset.error ?? null,
  );
  const isResetSubmitting = computed(() => passwordReset.isPending);

  const { isOpen: authDialogVisible, open, close } = useModalPresence({
    lockScroll: true,
    closeOnEscape: true,
    onOpen: () => {
      nextTick(() => {
        const target = emailField.value;
        if (target && typeof target.focus === 'function') {
          target.focus();
        }
      });
    },
    onClose: () => {
      loginError.value = '';
      loginForm.secret = '';
    },
  });

  const isAuthenticated = computed(() => session.isAuthenticated);
  const sessionReady = computed(() => session.initialised);

  const clearResetForm = () => {
    resetForm.firstName = '';
    resetForm.lastName = '';
    resetForm.callSign = '';
    resetForm.email = '';
    localResetError.value = null;
  };

  const openPasswordReset = () => {
    passwordReset.resetState();
    resetMode.value = true;
    localResetError.value = null;
    resetForm.firstName = '';
    resetForm.lastName = '';
    resetForm.callSign = '';
    resetForm.email = loginForm.email || '';
  };

  const closePasswordReset = () => {
    resetMode.value = false;
    passwordReset.resetState();
    clearResetForm();
  };

  const openAuthDialog = () => {
    loginError.value = '';
    if (!loginForm.email && session.currentUser?.email) {
      loginForm.email = session.currentUser.email;
    }
    open();
  };

  const closeAuthDialog = () => {
    close();
    closePasswordReset();
  };

  const submitLogin = async () => {
    if (!loginForm.email || !loginForm.secret) {
      loginError.value = 'Provide both email and password.';
      return;
    }

    isSubmitting.value = true;
    loginError.value = '';

    try {
      const email = loginForm.email.trim();
      await session.login({ email, password: loginForm.secret });
      const slug = session.currentUser?.profileSlug;
      if (slug) {
        await router.push('/bridge');
      }
      closeAuthDialog();
    } catch (error: any) {
      const message =
        error?.statusMessage ||
        error?.data?.error ||
        error?.response?._data?.error ||
        error?.message ||
        'Unable to embark. Check your dispatch and try again.';
      loginError.value = message;
    } finally {
      isSubmitting.value = false;
      loginForm.secret = '';
    }
  };

  const submitPasswordReset = async () => {
    if (isResetSubmitting.value) return;
    localResetError.value = null;
    const firstName = resetForm.firstName.trim();
    const lastName = resetForm.lastName.trim();
    const callSign = resetForm.callSign.trim();
    const email = resetForm.email.trim().toLowerCase();

    if (!firstName || !lastName || !callSign || !email) {
      localResetError.value = 'Fill in every field before requesting a reset.';
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      localResetError.value = 'Enter a valid dispatch email.';
      return;
    }

    try {
      await passwordReset.requestReset({
        firstName,
        lastName,
        callSign,
        email,
      });
    } catch {
      // Store captures the error state; surface it in the UI.
    }
  };

  const handleLogout = async () => {
    logoutPending.value = true;
    try {
      await session.logout();
      await router.push('/');
    } finally {
      logoutPending.value = false;
    }
  };

  watch(
    () => session.isAuthenticated,
    (authenticated) => {
      if (authenticated) {
        closeAuthDialog();
      }
    },
  );

  singletonController = {
    authDialogVisible,
    isAuthenticated,
    sessionReady,
    openAuthDialog,
    closeAuthDialog,
    submitLogin,
    handleLogout,
    loginError,
    isSubmitting,
    logoutPending,
    emailField,
    loginForm,
    isResetMode: resetMode,
    openPasswordReset,
    closePasswordReset,
    submitPasswordReset,
    passwordResetStatus,
    passwordResetMessage,
    passwordResetError,
    isResetSubmitting,
    resetForm,
  };

  provide(AuthDialogControllerKey, singletonController);

  return singletonController;
};

export const useAuthDialogController = () => {
  const injected = inject<AuthDialogController | null>(AuthDialogControllerKey, null);
  if (injected) return injected;
  if (!singletonController) {
    useAuthDialog();
  }
  return singletonController;
};

export const requestAuthDialog = () => {
  const controller = useAuthDialogController();
  controller?.openAuthDialog();
  return controller;
};
