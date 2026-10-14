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
        className="flex h-8 w-8 shrink-0 items-center justify-center justify-self-end rounded-[10px] border border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] transition-colors duration-200 hover:border-[#16A34A] hover:bg-[#16A34A] hover:text-white active:bg-[#15803D] active:border-[#15803D] outline-none focus:outline-none focus-visible:outline-none cursor-pointer sm:h-[40px] lg:h-[42px] sm:w-auto sm:gap-2 sm:rounded-[12px] sm:px-[18px] sm:text-xs lg:text-[13px] sm:font-semibold"
      >
        <span className="hidden sm:inline">Support</span>
        <Menu aria-hidden="true" className="h-4 w-4 sm:hidden" />
        <ChevronDown aria-hidden="true" className={`hidden h-3 w-3 sm:h-3.5 sm:w-3.5 transition-transform duration-200 motion-reduce:transition-none sm:block ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        id={panelId}
        inert={!open}
        aria-hidden={!open}
        className={`absolute right-0 top-full z-10 mt-2 grid w-44 origin-top-right transition-[grid-template-rows,opacity,transform,margin] duration-200 ease-out motion-reduce:transition-none sm:w-44 ${open ? "grid-rows-[1fr] opacity-100 translate-y-0" : "pointer-events-none grid-rows-[0fr] opacity-0 -translate-y-1"}`}
      >
        <div className="min-h-0 overflow-hidden rounded-[12px] border border-[#BBF7D0] bg-white shadow-[0_8px_24px_rgba(22,163,74,0.07)]">
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
                    className="flex min-h-9 items-center gap-2.5 rounded-[8px] px-2.5 py-1.5 text-xs font-semibold text-[#172033] transition-colors hover:bg-[#F0FDF4] hover:text-[#16A34A] active:bg-[#F0FDF4] active:text-[#22C55E] focus-visible:bg-[#F0FDF4] focus-visible:text-[#16A34A] motion-reduce:transition-none sm:px-3 sm:text-sm"
                  >
                    {Icon ? (
                      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-[#16A34A]" />
                    ) : (
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-[#16A34A]">
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
