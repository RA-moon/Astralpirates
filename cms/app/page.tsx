import { redirect } from 'next/navigation';

import { payloadConfigPromise } from './lib/payload.ts';

export default async function IndexPage() {
  const config = await payloadConfigPromise;
  const adminRoute = config.routes?.admin ?? '/admin';

  redirect(adminRoute);
}
