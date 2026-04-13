import { ref, watchEffect } from 'vue';
import type { Ref } from 'vue';

export type EditableBlock<T> = {
  source: Ref<string>;
  readonly data: T;
  readonly error: string;
  reset: () => void;
};

export const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export function createEditableBlock<T extends Record<string, any>>(
  fallback: T,
  normalise: (value: any) => T,
): EditableBlock<T> {
  const source = ref(JSON.stringify(fallback, null, 2));
  const data = ref<T>(deepClone(fallback)) as Ref<T>;
  const error = ref('');

  watchEffect(() => {
    try {
      const raw = JSON.parse(source.value);
      data.value = normalise(raw);
      error.value = '';
    } catch (parseError: any) {
      data.value = deepClone(fallback);
      error.value = parseError instanceof Error ? parseError.message : 'Unable to parse JSON payload.';
    }
  });

  const reset = () => {
    source.value = JSON.stringify(fallback, null, 2);
  };

  return {
    source,
    get data() {
      return data.value;
    },
    get error() {
      return error.value;
    },
    reset,
  };
}
