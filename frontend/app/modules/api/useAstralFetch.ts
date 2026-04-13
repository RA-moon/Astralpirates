import type { NitroFetchRequest } from 'nitropack';
import type { FetchError } from 'ofetch';
import type { UseFetchOptions } from '#app';
import type { AsyncData, KeysOf } from '#app/composables/asyncData';
import type { MaybeRefOrGetter } from 'vue';
import { createError, useFetch } from '#app';
import type { ZodType } from 'zod';
import { useSessionStore } from '~/stores/session';
import { resolveAstralApiBase } from '~/modules/api/requestFetch';

type AstralUseFetchOptions<TOutput, TSchema> = UseFetchOptions<
  TSchema,
  TOutput,
  KeysOf<TOutput>,
  TOutput
>;

export interface AstralFetchOptions<TOutput, TSchema = TOutput>
  extends Omit<AstralUseFetchOptions<TOutput, TSchema>, 'transform' | 'default'> {
  requiresAuth?: boolean;
  authOptional?: boolean;
  schema?: ZodType<TSchema>;
  transform?: (value: TSchema) => TOutput | Promise<TOutput>;
  default?: AstralUseFetchOptions<TOutput, TSchema>['default'] | TOutput;
}

export function useAstralFetch<TOutput = unknown, TSchema = TOutput>(
  request: MaybeRefOrGetter<NitroFetchRequest>,
  options: AstralFetchOptions<TOutput, TSchema> = {},
): AsyncData<TOutput | undefined, FetchError | undefined> {
  const session = useSessionStore();
  const {
    requiresAuth,
    authOptional,
    schema,
    onRequest: userOnRequest,
    transform: userTransform,
    ...fetchOptions
  } = options;
  const baseURL = resolveAstralApiBase();
  if (Object.prototype.hasOwnProperty.call(fetchOptions, 'default')) {
    const defaultOption = fetchOptions.default as unknown;
    if (typeof defaultOption !== 'function') {
      const value = defaultOption as TOutput | undefined;
      fetchOptions.default = (() => value) as unknown as UseFetchOptions<
        TSchema,
        TOutput,
        KeysOf<TOutput>,
        TOutput
      >['default'];
    }
  }

  let transform: UseFetchOptions<TSchema, TOutput, KeysOf<TOutput>, TOutput>['transform'] = userTransform;
  if (schema) {
    transform = async (value: unknown) => {
      const parsed = schema.parse(value) as TSchema;
      return userTransform ? await userTransform(parsed) : (parsed as unknown as TOutput);
    };
  }

  const resolvedOptions = fetchOptions as AstralUseFetchOptions<TOutput, TSchema>;

  return useFetch<
    TSchema,
    FetchError,
    NitroFetchRequest,
    any,
    TSchema,
    TOutput,
    KeysOf<TOutput>,
    TOutput
  >(request, {
    baseURL,
    ...resolvedOptions,
    transform,
    onRequest: async (ctx) => {
      const headers = new Headers(ctx.options.headers as HeadersInit | undefined);
      const bearerValue = session.bearerToken;

      if (requiresAuth) {
        if (bearerValue) {
          headers.set('Authorization', `Bearer ${bearerValue}`);
        } else if (!authOptional) {
          throw createError({
            statusCode: 401,
            statusMessage: 'Authentication required',
          });
        }
      }

      ctx.options.headers = headers;
      if (typeof userOnRequest === 'function') {
        await userOnRequest(ctx);
      }
    },
  }) as AsyncData<TOutput | undefined, FetchError | undefined>;
}
