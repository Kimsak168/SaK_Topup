"use client";

import { ThemeProvider } from "next-themes";

export function StorefrontThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-storefront-theme"
      storageKey="saksuuu_theme_mode"
      defaultTheme="dark"
      enableSystem={false}
      enableColorScheme={false}
    >
      {children}
    </ThemeProvider>
  );
}
