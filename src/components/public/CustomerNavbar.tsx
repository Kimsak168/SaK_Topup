"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2, House, ReceiptText } from "lucide-react";
import { SupportDropdown } from "@/components/public/SupportDropdown";

const links = [
  { href: "/", label: "Home", icon: House },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/orders", label: "Orders", icon: ReceiptText, desktopOnly: true },
];

export function CustomerNavbar({ logoUrl }: { logoUrl?: string } = {}) {
  const pathname = usePathname();

  return (
    <header className="public-navbar fixed inset-x-0 top-2 z-50 px-2.5 sm:top-5 sm:px-6">
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-1 rounded-full border border-card-border bg-card/95 px-2.5 py-1.5 shadow-soft backdrop-blur-md sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-x-4 sm:gap-y-2 sm:px-5 sm:py-3">
        <Link href="/" aria-label="SakSuuu Home" className="flex shrink-0 items-center gap-1.5 rounded-xl pr-1 sm:gap-2 sm:pr-2">
          <Image src={logoUrl || "/images/logo.png"} alt="" width={52} height={52} preload className="h-6 w-6 shrink-0 object-contain sm:h-12 sm:w-12" />
          <span className="saksuuu-brand-text-light text-sm font-black tracking-tight sm:text-2xl">SakSuuu</span>
        </Link>
        <nav aria-label="Main Navigation" className="flex items-center gap-1 sm:order-none sm:col-span-1 sm:rounded-full sm:bg-muted sm:p-1">
          {links.map(({ href, label, icon: Icon, desktopOnly }) => {
            const active = href === "/" ? pathname === "/" : href === "/games"
              ? pathname.startsWith("/games") || pathname.startsWith("/game/")
              : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`public-nav-link flex h-8 items-center justify-center gap-1 rounded-full px-2 text-[11px] font-semibold transition-colors min-[360px]:px-2.5 sm:h-auto sm:min-h-11 sm:gap-2 sm:rounded-full sm:px-4 sm:text-sm ${
                  desktopOnly ? "hidden sm:flex" : ""
                } ${
                  active
                    ? "bg-pink-50 text-primary border border-pink-200/60 sm:border-transparent sm:bg-card sm:text-primary sm:shadow-sm"
                    : "text-muted-foreground hover:bg-card/70 hover:text-foreground"
                }`}
              >
                <Icon aria-hidden="true" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <SupportDropdown />
      </div>
    </header>
  );
}
