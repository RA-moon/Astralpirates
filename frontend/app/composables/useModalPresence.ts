import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

type ModalPresenceOptions = {
  initial?: boolean;
  lockScroll?: boolean;
  closeOnEscape?: boolean;
  onOpen?: () => void | Promise<void>;
  onClose?: () => void | Promise<void>;
};

export const useModalPresence = (options: ModalPresenceOptions = {}) => {
  const { initial = false, lockScroll = true, closeOnEscape = true, onOpen, onClose } = options;
  const isOpen = ref(initial);

  let previousOverflow: string | null = null;
  let escapeListener: ((event: KeyboardEvent) => void) | null = null;

  const applyScrollLock = (visible: boolean) => {
    if (!lockScroll || !process.client) return;

    if (visible) {
      if (previousOverflow === null) {
        previousOverflow = document.body.style.overflow || '';
      }
      document.body.style.overflow = 'hidden';
    } else if (previousOverflow !== null) {
      document.body.style.overflow = previousOverflow;
      previousOverflow = null;
    }
  };

  const open = () => {
    if (!isOpen.value) {
      isOpen.value = true;
    }
  };

  const close = () => {
    if (isOpen.value) {
      isOpen.value = false;
    }
  };

  const toggle = () => {
    if (isOpen.value) {
      close();
    } else {
      open();
    }
  };

  watch(
    isOpen,
    (visible) => {
      applyScrollLock(visible);
      if (visible) {
        if (onOpen) {
          nextTick(() => {
            onOpen();
          });
        }
      } else if (onClose) {
        onClose();
      }
    },
    { flush: 'post' },
  );

  onMounted(() => {
    if (closeOnEscape && process.client) {
      escapeListener = (event: KeyboardEvent) => {
        if (event.key === 'Escape' && isOpen.value) {
          close();
        }
      };
      window.addEventListener('keydown', escapeListener);
    }
  });

  onBeforeUnmount(() => {
    applyScrollLock(false);
    if (escapeListener) {
      window.removeEventListener('keydown', escapeListener);
      escapeListener = null;
    }
  });

  return {
    isOpen,
    open,
    close,
    toggle,
  };
};
