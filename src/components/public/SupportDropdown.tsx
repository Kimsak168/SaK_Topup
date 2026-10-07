"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Headset, Menu } from "lucide-react";
import { SOCIAL_URLS } from "@/lib/socialLinks";

const menuLinks = [
  {
    label: "Support",
    href: SOCIAL_URLS.telegram,
    icon: Headset,
  },
  {
    label: "Telegram",
    href: SOCIAL_URLS.telegram,
    path: "M9.78 15.43 9.4 20.8c.54 0 .78-.23 1.06-.51l2.55-2.44 5.29 3.87c.97.54 1.67.26 1.91-.9L23.67 4c.35-1.44-.55-2.09-1.48-1.67L1.84 10.18c-1.39.56-1.38 1.33-.25 1.67l5.22 1.63L18.9 5.86c.57-.35 1.09-.16.66.23Z",
  },
  {
    label: "Facebook",
    href: SOCIAL_URLS.facebook,
    path: "M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.931-1.956 1.887v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z",
  },
  {
    label: "TikTok",
    href: SOCIAL_URLS.tiktok,
    path: "M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2H12.3v13.967a2.955 2.955 0 0 1-2.95 2.658 2.953 2.953 0 0 1-2.955-2.95 2.953 2.953 0 0 1 2.955-2.95c.305 0 .6.048.879.135V9.286a6.46 6.46 0 0 0-.879-.06 6.45 6.45 0 0 0-6.45 6.45 6.45 6.45 0 0 0 6.45 6.45 6.45 6.45 0 0 0 6.45-6.45V8.54a8.27 8.27 0 0 0 4.834 1.55V6.638c-.35 0-.7-.035-1.045-.104Z",
  },
];

export function SupportDropdown() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-self-end sm:block"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((current) => !current)}
        className="public-nav-link flex h-8 w-8 shrink-0 items-center justify-center justify-self-end rounded-full border border-[#F4C7DD] bg-[#FFF1F7] text-[#EC168C] hover:bg-[#FF3AA2] hover:text-white transition-colors sm:h-auto sm:w-auto sm:min-h-11 sm:gap-1.5 sm:px-4 sm:text-xs sm:font-semibold"
      >
        <span className="hidden sm:inline">Support</span>
        <Menu aria-hidden="true" className="h-4 w-4 sm:hidden" />
        <ChevronDown aria-hidden="true" className={`hidden h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none sm:block ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        id={panelId}
        inert={!open}
        aria-hidden={!open}
        className={`absolute right-0 top-full z-10 mt-2 grid w-44 origin-top-right transition-[grid-template-rows,opacity,transform,margin] duration-200 ease-out motion-reduce:transition-none sm:w-44 ${open ? "grid-rows-[1fr] opacity-100 translate-y-0" : "pointer-events-none grid-rows-[0fr] opacity-0 -translate-y-1"}`}
      >
        <div className="min-h-0 overflow-hidden rounded-2xl shadow-sm border border-[#F4C7DD] bg-white">
          <nav aria-label="Support social links" className="p-1">
            <ul className="flex flex-col gap-0.5 sm:grid sm:grid-cols-1">
              {menuLinks.map(({ label, href, icon: Icon, path }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${label} (opens in a new tab)`}
                    onClick={() => {
                      setOpen(false);
                      buttonRef.current?.focus();
                    }}
                    className="flex min-h-9 items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-[#1E293B] transition-colors hover:bg-[#FFF1F7] hover:text-[#EC168C] focus-visible:bg-[#FFF1F7] focus-visible:text-[#EC168C] motion-reduce:transition-none sm:px-3 sm:text-sm"
                  >
                    {Icon ? (
                      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#EC168C]" />
                    ) : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-[#EC168C]">
                        <path d={path} />
                      </svg>
                    )}
                    <span>{label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}
