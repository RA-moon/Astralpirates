import 'server-only';

import type { ImportMap } from 'payload';
import { RootPage, generatePageMetadata } from '@payloadcms/next/views';

import { payloadConfigPromise } from '@/app/lib/payload';
import { importMap as payloadAdminImportMap } from '../importMap';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type ParamsInput = { segments?: string[] } | Promise<{ segments?: string[] } | undefined> | undefined;
type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined> | undefined>
  | undefined;

const normaliseParams = async (params: ParamsInput) => {
  const resolved = await params;
  return {
    segments: Array.isArray(resolved?.segments) ? resolved.segments : [],
  };
};

const normaliseSearchParams = async (searchParams: SearchParamsInput) => {
  const resolved = await searchParams;
  if (!resolved) return {} as Record<string, string | string[]>;
  const entries = Object.entries(resolved).filter(([, value]) => typeof value !== 'undefined') as Array<
    [string, string | string[]]
  >;
  return Object.fromEntries(entries);
};

const importMapPromise: Promise<ImportMap> = Promise.resolve(payloadAdminImportMap as ImportMap);

export async function generateMetadata({ params, searchParams }: { params: ParamsInput; searchParams?: SearchParamsInput }) {
  return generatePageMetadata({
    config: payloadConfigPromise,
    params: normaliseParams(params),
    searchParams: normaliseSearchParams(searchParams),
  });
}

export default async function AdminPage(props: { params: ParamsInput; searchParams?: SearchParamsInput }) {
  return RootPage({
    config: payloadConfigPromise,
    importMap: importMapPromise,
    params: normaliseParams(props.params),
    searchParams: normaliseSearchParams(props.searchParams),
  });
}
