import { ref, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import type { CrewSearchResult } from '~/types/crew';
import { getRequestFetch } from '~/modules/api';

type CrewSearchResponse = {
  members?: CrewSearchResult[];
  error?: string;
};

type UseCrewSearchOptions = {
  minQueryLength?: number;
  limit?: number;
};

export const useCrewSearch = (options: UseCrewSearchOptions = {}) => {
  const minQueryLength = options.minQueryLength ?? 3;
  const limit = options.limit ?? 10;

  const query = ref('');
  const results = ref<CrewSearchResult[]>([]);
  const pending = ref(false);
  const error = ref('');

  const requestFetch = getRequestFetch();

  const performSearch = async (term: string) => {
    if (!term || term.length < minQueryLength) return;
    pending.value = true;
    error.value = '';
    try {
      const response = await requestFetch<CrewSearchResponse>('/api/crew', {
        params: {
          q: term,
          limit: String(limit),
        },
      });
      const members = Array.isArray(response.members) ? response.members : [];
      results.value = members;
    } catch (err: any) {
      error.value =
        err?.data?.error ||
        err?.statusMessage ||
        err?.message ||
        'Unable to load crew manifest.';
      results.value = [];
    } finally {
      pending.value = false;
    }
  };

  const debouncedSearch = useDebounceFn(performSearch, 250);

  watch(
    query,
    (next) => {
      const trimmed = next.trim();
      if (!trimmed || trimmed.length < minQueryLength) {
        results.value = [];
        error.value = '';
        pending.value = false;
        return;
      }
      debouncedSearch(trimmed);
    },
    { flush: 'post' },
  );

  const setQuery = (value: string) => {
    query.value = value;
  };

  const clear = () => {
    query.value = '';
    results.value = [];
    error.value = '';
    pending.value = false;
  };

  return {
    query,
    results,
    pending,
    error,
    setQuery,
    clear,
    search: performSearch,
  };
};
