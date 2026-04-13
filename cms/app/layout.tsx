import type { ReactNode } from 'react';
import '@payloadcms/next/css';
import '@astralpirates/shared/theme/tokens.css';
import '@astralpirates/shared/theme/themes/default.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="default">
      <body>{children}</body>
    </html>
  );
}
