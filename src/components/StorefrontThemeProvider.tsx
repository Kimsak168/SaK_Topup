"use client";

import { ThemeProvider } from "next-themes";

export function StorefrontThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-storefront-theme"
      storageKey="saksuuu_public_theme"
      defaultTheme="light"
      enableSystem={false}
      enableColorScheme={false}
    >
      {children}
    </ThemeProvider>
  );
}
