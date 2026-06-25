'use client';

import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';

export function Provider({
  children,
  locale,
}: {
  children: ReactNode;
  locale?: Parameters<typeof RootProvider>[0]['locale'];
}) {
  return <RootProvider locale={locale}>{children}</RootProvider>;
}
