import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import "./storefront-theme.css";
import { cn } from "@/lib/utils";
import { ThemeToaster } from "@/components/ThemeToaster";
import { StorefrontThemeProvider } from "@/components/StorefrontThemeProvider";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Asura Store — Fast & Secure Automated Game Top-Up",
  description:
    "Instant automated game top-up for Free Fire, PUBG Mobile, Mobile Legends, and more. Direct official WebBuilder API integration with 24/7 delivery.",
  keywords: [
    "Asura Store",
    "Game Top Up",
    "Free Fire Diamonds",
    "PUBG Mobile UC",
    "Mobile Legends Diamonds",
    "MLBB Weekly Pass",
    "Honor of Kings Tokens",
    "WebBuilder API",
    "Instant Gaming Recharge",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="km"
      suppressHydrationWarning
      className={cn(
        "h-full antialiased scroll-smooth bg-black dark",
        inter.variable,
        jetbrainsMono.variable,
        "font-sans"
      )}
    >
      <body className="min-h-full flex flex-col bg-black text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
        <StorefrontThemeProvider>
          {children}
          <ThemeToaster />
        </StorefrontThemeProvider>
      </body>
    </html>
  );
}
