'use client';

import { RootProvider } from 'fumadocs-ui/provider/next';
import type { ReactNode } from 'react';

interface ProviderProps {
  children: ReactNode;
  locale?: { locale: string; translations: Record<string, string> };
}

export function Provider({ children, locale }: ProviderProps) {
  return (
    <RootProvider
      i18n={locale ? { locale: locale.locale, translations: locale.translations } : undefined}
      theme={{ defaultTheme: 'dark', enableSystem: false }}
    >
      {children}
    </RootProvider>
  );
}
