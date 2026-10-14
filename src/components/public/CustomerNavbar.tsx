"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SupportDropdown } from "@/components/public/SupportDropdown";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Games" },
  { href: "/orders", label: "Orders" },
];

function getActiveIndex(pathname: string): number {
  if (pathname === "/") return 0;
  if (pathname.startsWith("/games") || pathname.startsWith("/game/")) return 1;
  if (pathname.startsWith("/orders")) return 2;
  return -1;
}

const BRAND_NAME = "SakSuuu";

export function CustomerNavbar({ logoUrl }: { logoUrl?: string } = {}) {
  const pathname = usePathname();
  const activeIndex = getActiveIndex(pathname);

  // One-time brand typing animation state
  const [displayedBrand, setDisplayedBrand] = useState("");
  const [showCursor, setShowCursor] = useState(false);

  useEffect(() => {
    // If user prefers reduced motion, show full brand immediately with no animation
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplayedBrand(BRAND_NAME);
      setShowCursor(false);
      return;
    }

    // Start with blinking cursor visible
    setShowCursor(true);
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let blinkTimer: ReturnType<typeof setTimeout> | undefined;

    // 250ms initial breathing room so user sees the cursor before typing begins
    const startTimer = setTimeout(() => {
      let index = 0;
      intervalId = setInterval(() => {
        index++;
        setDisplayedBrand(BRAND_NAME.slice(0, index));

        if (index >= BRAND_NAME.length) {
          if (intervalId) clearInterval(intervalId);
          // Blink cursor 1-2 times (~800ms) after fully typed, then hide permanently
          blinkTimer = setTimeout(() => {
            setShowCursor(false);
          }, 800);
        }
      }, 115);
    }, 250);

    return () => {
      clearTimeout(startTimer);
      if (intervalId) clearInterval(intervalId);
      if (blinkTimer) clearTimeout(blinkTimer);
    };
  }, []);

  const [underlineStyle, setUnderlineStyle] = useState<{
    left: number;
    width: number;
    top: number;
    opacity: number;
  }>({ left: 0, width: 0, top: 0, opacity: 0 });

  const tabRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  useEffect(() => {
    function updateUnderline() {
      if (activeIndex >= 0 && tabRefs.current[activeIndex]) {
        const el = tabRefs.current[activeIndex];
        if (el) {
          setUnderlineStyle({
            left: el.offsetLeft,
            width: el.offsetWidth,
            top: el.offsetTop + el.offsetHeight + 7,
            opacity: 1,
          });
        }
      } else {
        setUnderlineStyle((prev) => ({ ...prev, opacity: 0 }));
      }
    }

    updateUnderline();

    window.addEventListener("resize", updateUnderline);
    document.fonts?.ready?.then?.(updateUnderline);

    return () => {
      window.removeEventListener("resize", updateUnderline);
    };
  }, [activeIndex]);

  return (
    <header className="public-navbar fixed inset-x-0 top-1.5 z-50 px-2 min-[360px]:px-2.5 sm:top-3 sm:px-6">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="relative isolate mx-auto flex w-full max-w-[1500px] items-center justify-between gap-2 rounded-[18px] border border-[#BBF7D0] bg-white/[0.94] px-3.5 shadow-[0_8px_24px_rgba(22,163,74,0.07)] backdrop-blur-md min-[360px]:px-4 sm:grid sm:h-[72px] sm:grid-cols-[1fr_auto_1fr] sm:gap-x-4 sm:rounded-[20px] sm:px-6 sm:py-0">
        {/* Left: SakSuuu Logo + Animated Typed Text */}
        <Link
          href="/"
          aria-label="SakSuuu Home"
          className="flex shrink-0 items-center gap-2 sm:gap-2.5 outline-none focus:outline-none focus-visible:outline-none"
        >
          <Image
            src={logoUrl || "/images/logo.png"}
            alt=""
            width={40}
            height={40}
            priority
            className="h-7 w-7 shrink-0 object-contain sm:h-[38px] sm:w-[38px]"
          />
          <span
            aria-label={BRAND_NAME}
            className="relative inline-flex items-center text-base font-bold tracking-tight text-[#172033] sm:text-[24px] lg:text-[25px] sm:font-bold select-none"
          >
            {/* Invisible ghost placeholder strictly reserving exact width & height in document flow */}
            <span
              aria-hidden="true"
              className="invisible select-none pointer-events-none"
            >
              {BRAND_NAME}
            </span>
            {/* Live animated typed text positioned directly over placeholder */}
            <span
              aria-hidden="true"
              className="absolute inset-y-0 left-0 flex items-center whitespace-nowrap"
            >
              <span>{displayedBrand}</span>
              {showCursor && (
                <span
                  aria-hidden="true"
                  className="sak-cursor-blink ml-0.5 inline-block h-[0.9em] w-[2px] rounded-full bg-[#16A34A]"
                />
              )}
            </span>
          </span>
        </Link>

        {/* Center: Text-Only Navigation with Smooth Sliding Green Underline */}
        <nav
          aria-label="Main Navigation"
          className="relative flex items-center justify-center gap-4 bg-transparent py-2 select-none min-[360px]:gap-5 sm:col-span-1 sm:justify-self-center sm:gap-10"
        >
          {navLinks.map(({ href, label }, idx) => {
            const isActive = activeIndex === idx;
            return (
              <Link
                key={href}
                href={href}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                aria-current={isActive ? "page" : undefined}
                className={`relative inline-flex items-center justify-center bg-transparent text-center text-[13px] leading-none whitespace-nowrap outline-none focus:outline-none focus-visible:outline-none transition-[color,transform] duration-[200ms] ease-out hover:-translate-y-[1px] min-[360px]:text-[13.5px] sm:text-[15.5px] lg:text-[16px] ${
                  isActive
                    ? "font-bold text-[#16A34A]"
                    : "font-medium text-[#64748B] hover:text-[#16A34A] active:text-[#16A34A]"
                }`}
              >
                <span>{label}</span>
              </Link>
            );
          })}

          {/* Smooth sliding green underline (2px height, 7px below text, 250ms transition) */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 h-[2px] rounded-full bg-[#16A34A] transition-[transform,width,opacity] duration-[250ms] ease-out motion-reduce:transition-none"
            style={{
              transform: `translate3d(${underlineStyle.left}px, ${underlineStyle.top}px, 0)`,
              width: `${underlineStyle.width}px`,
              opacity: underlineStyle.opacity,
            }}
          />
        </nav>

        {/* Right: Menu / Support Dropdown */}
        <SupportDropdown />
      </div>
    </header>
  );
}
