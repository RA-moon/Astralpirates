import type { ImportMap, ServerFunctionClient } from 'payload';
import type { ReactNode } from 'react';
import { RootLayout, handleServerFunctions } from '@payloadcms/next/layouts';

import payloadConfig from '../../payload.config';
import { importMap as payloadAdminImportMap } from './admin/importMap';

const configPromise = Promise.resolve(payloadConfig);
const importMapPromise: Promise<ImportMap> = Promise.resolve(payloadAdminImportMap as ImportMap);

export default async function PayloadLayout({ children }: { children: ReactNode }) {
  const [config, importMap] = await Promise.all([configPromise, importMapPromise]);

  const serverFunction: ServerFunctionClient = async ({ name, args }) => {
    'use server';
    return handleServerFunctions({
      name,
      args,
      config,
      importMap,
    });
  };

  return (
    <RootLayout config={Promise.resolve(config)} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  );
}
