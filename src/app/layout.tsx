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
  title: "SakSuuu Top-Up — Fast & Secure Automated Game Top-Up",
  description:
    "Instant automated game top-up for Free Fire, PUBG Mobile, Mobile Legends, and more. Direct official WebBuilder API integration with 24/7 delivery.",
  keywords: [
    "SakSuuu",
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
        "h-full antialiased scroll-smooth bg-[#FFF8FC] dark",
        inter.variable,
        jetbrainsMono.variable,
        "font-sans"
      )}
    >
      <body className="min-h-full flex flex-col bg-[#FFF8FC] text-[#3B2D39] font-sans selection:bg-[#FBCFE8] selection:text-[#3B2D39]">
        <StorefrontThemeProvider>
          {children}
          <ThemeToaster />
        </StorefrontThemeProvider>
      </body>
    </html>
  );
}
