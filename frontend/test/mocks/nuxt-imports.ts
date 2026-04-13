import { reactive } from 'vue';
import { useFetch } from './nuxt-app';

export const mockedRoute = reactive({
  path: '/',
  fullPath: '/',
  params: {} as Record<string, string>,
  query: {} as Record<string, string>,
  hash: '',
  name: undefined as string | undefined,
  matched: [],
  meta: {},
});

export const useRoute = () => mockedRoute;
export { useFetch };
