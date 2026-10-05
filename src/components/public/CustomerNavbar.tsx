"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TELEGRAM_URL = process.env.NEXT_PUBLIC_TELEGRAM_SUPPORT || "https://t.me/saksuuu_support";
const BRAND_NAME = "SakSuuu";

export function CustomerNavbar({ logoUrl }: { logoUrl?: string } = {}) {
  const pathname = usePathname();

  const isHomeActive = pathname === "/";
  const isGamesActive = pathname.startsWith("/games") || pathname.startsWith("/game");

  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    // Respect reduced-motion preferences
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (prefersReducedMotion) {
      setDisplayText(BRAND_NAME);
      return;
    }

    let timer: NodeJS.Timeout;

    if (!isDeleting) {
      if (displayText.length < BRAND_NAME.length) {
        timer = setTimeout(() => {
          setDisplayText(BRAND_NAME.slice(0, displayText.length + 1));
        }, 130);
      } else {
        // Full name appeared: pause briefly before repeating
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, 2600);
      }
    } else {
      if (displayText.length > 0) {
        timer = setTimeout(() => {
          setDisplayText(BRAND_NAME.slice(0, displayText.length - 1));
        }, 60);
      } else {
        // Erase completed: brief pause before typing again
        timer = setTimeout(() => {
          setIsDeleting(false);
        }, 400);
      }
    }

    return () => clearTimeout(timer);
  }, [displayText, isDeleting]);

  return (
    <header className="fixed top-3 sm:top-5 inset-x-0 z-50 pointer-events-none flex justify-center px-2 sm:px-4">
      {/* Floating Pill-Shaped Navbar — glassmorphism white */}
      <div className="pointer-events-auto animate-navbar-float relative flex flex-wrap items-center justify-between gap-y-2 w-[92%] max-w-[1500px] py-2 sm:py-0 sm:h-[82px] md:h-[88px] px-3.5 sm:px-7 rounded-3xl sm:rounded-full border border-card-border bg-card/95 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08),0_0_0_1px_rgba(255,255,255,0.5)] transition-all duration-300 hover:shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
        {/* Top Rim Reflection Highlight */}
        <div className="absolute top-0 inset-x-12 sm:inset-x-24 h-px bg-gradient-to-r from-transparent via-pink-400/20 to-transparent pointer-events-none" />

        {/* Left — Ghost Gaming Mascot Logo + Animated SakSuuu Name */}
        <Link
          href="/"
          aria-label="SakSuuu Home"
          className="relative flex items-center gap-2 sm:gap-3.5 shrink-0 focus-visible:outline-2 focus-visible:outline-ring focus-visible:ring-2 focus-visible:ring-ring rounded-2xl z-10 group"
        >
          {/* Ghost Gaming Mascot Logo (~70-75px on desktop, proportional 1:1, uncropped) */}
          <div className="relative flex items-center justify-center shrink-0">
            <Image
              src={logoUrl || "/images/logo.png"}
              alt="SakSuuu Logo"
              width={75}
              height={75}
              preload
              className="h-[50px] w-[50px] sm:h-[66px] sm:w-[66px] md:h-[74px] md:w-[74px] object-contain shrink-0 drop-shadow-[0_0_16px_rgba(0,217,255,0.45)] transition-transform duration-300 group-hover:scale-105"
            />
          </div>

          {/* Website Name with Animated Typing Effect & Zero Layout Shift */}
          <div className="relative inline-flex items-center select-none">
            {/* Structural spacer matching exact text dimensions to prevent layout shifting */}
            <span
              aria-hidden="true"
              className="invisible pointer-events-none select-none font-black tracking-wide text-base sm:text-xl md:text-[28px] lg:text-[32px] whitespace-nowrap"
            >
              {BRAND_NAME}
            </span>

            {/* Animated writing overlay with blue-to-cyan gradient shimmer */}
            <span
              aria-label={BRAND_NAME}
              className="absolute left-0 inset-y-0 flex items-center font-black tracking-wide text-base sm:text-xl md:text-[28px] lg:text-[32px] whitespace-nowrap"
            >
              <span className="saksuuu-brand-text-light">
                {displayText}
              </span>
              {/* Animated typing cursor */}
              <span
                aria-hidden="true"
                className="inline-block w-[2px] md:w-[3px] h-[0.75em] ml-0.5 md:ml-1 bg-blue-500 rounded-full animate-pulse shadow-[0_0_8px_#3b82f6]"
              />
            </span>
          </div>
        </Link>

        {/* Middle — Dead-Center Navigation: Home & Games */}
        <nav
          aria-label="Main Navigation"
          className="order-last w-full justify-center sm:order-none sm:w-auto sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 flex items-center p-1 sm:p-1.5 rounded-full bg-muted border border-border backdrop-blur-md shadow-sm"
        >
          <Link
            href="/"
            className={`relative flex items-center gap-1.5 rounded-full px-3 sm:px-5 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold transition-all duration-300 ${
              isHomeActive
                ? "bg-card text-primary border border-pink-200 shadow-md shadow-pink-100/50"
                : "text-muted-foreground hover:text-foreground hover:bg-card"
            }`}
          >
            {isHomeActive && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 animate-pulse" />
            )}
            <span>Home</span>
          </Link>

          <Link
            href="/games"
            className={`relative flex items-center gap-1.5 rounded-full px-3 sm:px-5 py-1 sm:py-1.5 text-xs sm:text-sm font-semibold transition-all duration-300 ${
              isGamesActive
                ? "bg-card text-primary border border-pink-200 shadow-md shadow-pink-100/50"
                : "text-muted-foreground hover:text-foreground hover:bg-card"
            }`}
          >
            {isGamesActive && (
              <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 animate-pulse" />
            )}
            <span>Games</span>
          </Link>
        </nav>

        {/* Right — Official Telegram Logo Link (No Text) */}
        <div className="flex items-center shrink-0 z-10">
          <Link
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Telegram Support"
            title="Chat on Telegram"
            className="group relative flex h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 items-center justify-center rounded-full bg-[#229ED9]/10 border border-[#229ED9]/25 text-brand-blue hover:text-primary-foreground hover:bg-brand-blue hover:border-[#229ED9] shadow-sm hover:shadow-soft hover:shadow-[#229ED9]/20 hover:scale-105 active:scale-95 transition-all duration-300 focus-visible:outline-2 focus-visible:outline-ring focus-visible:ring-2 focus-visible:ring-brand-blue"
          >
            {/* Telegram Official Icon */}
            <svg
              className="h-4.5 w-4.5 sm:h-5 sm:w-5 md:h-5.5 md:w-5.5 transition-transform duration-300 group-hover:scale-110"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}
