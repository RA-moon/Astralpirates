import { ref } from 'vue';

type Toast = {
  id: string;
  title: string;
  message: string;
};

const toasts = ref<Toast[]>([]);

export const useToast = () => {
  const show = (payload: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    toasts.value = [...toasts.value, { ...payload, id }];
    return id;
  };

  const dismiss = (id: string) => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  };

  return {
    toasts,
    show,
    dismiss,
  };
};
