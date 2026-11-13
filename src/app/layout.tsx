import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Kantumruy_Pro } from "next/font/google";
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

const kantumruyPro = Kantumruy_Pro({
  subsets: ["khmer", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-kantumruy-pro",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.asuratopup.store"),
  title: {
    default: "Asura Store",
    template: "%s | Asura Store",
  },
  description:
    "Instant automated game top-up and social media services in Cambodia. Fast 24/7 delivery via KHQR.",
  keywords: [
    "Asura Store",
    "Game Top Up",
    "Free Fire Diamonds",
    "PUBG Mobile UC",
    "Mobile Legends Diamonds",
    "MLBB Weekly Pass",
    "Honor of Kings Tokens",
    "Roblox Robux",
    "Instant Gaming Recharge",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/apple-icon.png", sizes: "180x180" },
    ],
  },
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
        kantumruyPro.variable,
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
