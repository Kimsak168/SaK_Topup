import type { Metadata } from "next";
import Script from "next/script";
import { Inter, JetBrains_Mono, Kantumruy_Pro } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { ThemeToaster } from "@/components/ThemeToaster";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const kantumruyPro = Kantumruy_Pro({
  subsets: ["khmer", "latin"],
  variable: "--font-khmer",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SakSuuu Top-Up — Fast & Secure Automated Game Top-Up",
  description:
    "Instant automated game top-up for Free Fire, PUBG Mobile, Mobile Legends, and more. Direct official Vizo and G2Bulk API integrations with 24/7 delivery.",
  keywords: [
    "SakSuuu",
    "Game Top Up",
    "Free Fire Diamonds",
    "PUBG Mobile UC",
    "Mobile Legends Diamonds",
    "MLBB Weekly Pass",
    "Vizo API",
    "G2Bulk API",
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
      className={cn(
        "h-full antialiased scroll-smooth",
        inter.variable,
        kantumruyPro.variable,
        jetbrainsMono.variable,
        "font-sans"
      )}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans selection:bg-primary selection:text-primary-foreground">
        {children}
        <ThemeToaster />
        <Script src="https://anajakpay.com/khqrcc-plugin.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
