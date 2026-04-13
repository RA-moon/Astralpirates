import { ref } from 'vue';

export const useFeedback = () => {
  const message = ref('');
  const isError = ref(false);

  const setFeedback = (value: string, error = false) => {
    message.value = value;
    isError.value = error;
  };

  const clearFeedback = () => {
    message.value = '';
    isError.value = false;
  };

  return {
    message,
    isError,
    setFeedback,
    clearFeedback,
  };
};
