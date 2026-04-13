import { createError } from '#app';
import { acceptHMRUpdate, defineStore } from 'pinia';
import { getRequestFetch } from '~/modules/api';

type ResetStatus = 'idle' | 'pending' | 'success' | 'error';

export type PasswordResetPayload = {
  firstName: string;
  lastName: string;
  callSign: string;
  email: string;
};

const MIN_INTERVAL_MS = 15_000;

export const usePasswordResetStore = defineStore('passwordReset', {
  state: () => ({
    status: 'idle' as ResetStatus,
    error: null as string | null,
    message: null as string | null,
    lastRequestAt: 0,
  }),
  getters: {
    isPending: (state) => state.status === 'pending',
    isSuccess: (state) => state.status === 'success',
  },
  actions: {
    resetState() {
      this.status = 'idle';
      this.error = null;
      this.message = null;
    },
    async requestReset(payload: PasswordResetPayload) {
      const now = Date.now();
      if (this.lastRequestAt && now - this.lastRequestAt < MIN_INTERVAL_MS) {
        const remaining = Math.ceil((MIN_INTERVAL_MS - (now - this.lastRequestAt)) / 1000);
        const message = `Please wait ${remaining} seconds before requesting another reset.`;
        this.status = 'error';
        this.error = message;
        throw createError({
          statusCode: 429,
          statusMessage: message,
        });
      }

      const requestFetch = getRequestFetch();

      this.status = 'pending';
      this.error = null;
      this.message = null;

      try {
        const response = await requestFetch<{ message?: string }>('/api/password-resets', {
          method: 'POST',
          body: {
            firstName: payload.firstName,
            lastName: payload.lastName,
            callSign: payload.callSign,
            email: payload.email,
          },
        });
        this.status = 'success';
        this.message = response?.message ?? 'Check your dispatch email for the reset link.';
        this.lastRequestAt = now;
        return { message: this.message };
      } catch (error: any) {
        const status =
          Number.parseInt(error?.statusCode ?? error?.response?.status ?? '', 10) || null;
        const message =
          error?.data?.error ||
          error?.response?._data?.error ||
          error?.statusMessage ||
          error?.message ||
          'Unable to send password reset email.';
        this.status = 'error';
        this.error = message;
        throw createError({
          statusCode: status ?? 500,
          statusMessage: message,
        });
      }
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePasswordResetStore, import.meta.hot));
}
