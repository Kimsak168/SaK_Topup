"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SupportDropdown } from "@/components/public/SupportDropdown";
import styles from "./CustomerNavbar.module.css";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/games", label: "Games" },
  { href: "/orders", label: "Orders" },
];

function isCurrentPage(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/games") return pathname.startsWith("/games") || pathname.startsWith("/game/");
  return pathname.startsWith(href);
}

const BRAND_ANIMATION_KEY = "saksuuu-navbar-brand-typed";

export function CustomerNavbar({ logoUrl }: { logoUrl?: string } = {}) {
  const pathname = usePathname();
  const [brandTyping, setBrandTyping] = useState(false);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(BRAND_ANIMATION_KEY)) return;
      window.sessionStorage.setItem(BRAND_ANIMATION_KEY, "done");
    } catch {
      // Keep the complete brand visible when browser storage is unavailable.
      return;
    }

    setBrandTyping(true);
    const timer = window.setTimeout(() => setBrandTyping(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <header className={`${styles.header} public-navbar`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className={styles.shell}>
        <Link href="/" aria-label="SakSuuu Home" className={styles.brand}>
          <Image
            src={logoUrl || "/images/logo.png"}
            alt=""
            width={44}
            height={44}
            preload
            className={styles.logo}
          />
          <span aria-hidden="true" className={styles.wordmark}>
            <span className={`${styles.wordmarkText} ${brandTyping ? styles.wordmarkTyping : ""}`}>
              <span className={styles.wordmarkDark}>Sak</span>
              <span className={styles.wordmarkGreen}>Suuu</span>
            </span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className={styles.primaryNav}>
          {navLinks.map(({ href, label }) => {
            const active = isCurrentPage(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className={styles.actions}>
          <SupportDropdown logoUrl={logoUrl} />
        </div>
      </div>
    </header>
  );
}
