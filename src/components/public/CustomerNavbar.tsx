"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2, Headphones, Home, Menu, Search, Sparkles, X } from "lucide-react";
import { SOCIAL_URLS } from "@/lib/socialLinks";
import styles from "./CustomerNavbar.module.css";

const navLinks = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/#games", label: "Games", Icon: Gamepad2 },
  { href: "/#services", label: "Services", Icon: Sparkles },
];

const telegramIconPath = "M9.78 15.43 9.4 20.8c.54 0 .78-.23 1.06-.51l2.55-2.44 5.29 3.87c.97.54 1.67.26 1.91-.9L23.67 4c.35-1.44-.55-2.09-1.48-1.67L1.84 10.18c-1.39.56-1.38 1.33-.25 1.67l5.22 1.63L18.9 5.86c.57-.35 1.09-.16.66.23Z";

type HomeSection = "home" | "games" | "services";

function isCurrentPage(pathname: string, href: string, activeHomeSection: HomeSection): boolean {
  if (href === "/") return pathname === "/" && activeHomeSection === "home";
  if (href.endsWith("#services")) {
    return pathname.startsWith("/services") || (pathname === "/" && activeHomeSection === "services");
  }
  return pathname.startsWith("/games") || pathname.startsWith("/game/") ||
    (pathname === "/" && activeHomeSection === "games");
}

function validSocialUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    // Missing or malformed social destinations are omitted.
  }
}

const drawerSocialLinks = [
  {
    label: "Telegram",
    href: validSocialUrl(SOCIAL_URLS.telegram),
    path: telegramIconPath,
  },
  {
    label: "Facebook",
    href: validSocialUrl(SOCIAL_URLS.facebook),
    path: "M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.931-1.956 1.887v2.264h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z",
  },
  {
    label: "TikTok",
    href: validSocialUrl(SOCIAL_URLS.tiktok),
    path: "M19.589 6.686a4.793 4.793 0 0 1-3.77-4.245V2H12.3v13.967a2.955 2.955 0 0 1-2.95 2.658 2.953 2.953 0 0 1-2.955-2.95 2.953 2.953 0 0 1 2.955-2.95c.305 0 .6.048.879.135V9.286a6.46 6.46 0 0 0-.879-.06 6.45 6.45 0 0 0-6.45 6.45 6.45 6.45 0 0 0 6.45 6.45 6.45 6.45 0 0 0 6.45-6.45V8.54a8.27 8.27 0 0 0 4.834 1.55V6.638c-.35 0-.7-.035-1.045-.104Z",
  },
].filter((link): link is typeof link & { href: string } => Boolean(link.href));

export function CustomerNavbar({ logoUrl }: { logoUrl?: string } = {}) {
  const pathname = usePathname();
  const [resolvedLogoUrl, setResolvedLogoUrl] = useState(logoUrl);
  const [activeHomeSection, setActiveHomeSection] = useState<HomeSection>("home");
  const [brandTyping, setBrandTyping] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerId = useId();
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setBrandTyping(true);
    const timer = window.setTimeout(() => setBrandTyping(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (logoUrl) {
      setResolvedLogoUrl(logoUrl);
      return;
    }

    let active = true;
    void fetch("/api/settings/public-logo", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Public logo request failed");
        const result = (await response.json()) as { logoUrl?: unknown };
        if (active && typeof result.logoUrl === "string" && result.logoUrl.trim()) {
          setResolvedLogoUrl(result.logoUrl);
        }
      })
      .catch(() => {
        console.error("[CustomerNavbar] Unable to load the saved logo setting.");
      });

    return () => {
      active = false;
    };
  }, [logoUrl]);

  useEffect(() => {
    if (pathname !== "/") {
      setActiveHomeSection("home");
      return;
    }

    let frame = 0;
    const updateActiveSection = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const marker = window.innerHeight * 0.3;
        const games = document.getElementById("games")?.getBoundingClientRect();
        const services = document.getElementById("all-platforms")?.getBoundingClientRect() || document.getElementById("services")?.getBoundingClientRect();
        const next: HomeSection =
          services && services.top <= marker ? "services" :
          games && games.top <= marker ? "games" :
          "home";
        setActiveHomeSection((current) => current === next ? current : next);
      });
    };

    updateActiveSection();
    window.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("hashchange", updateActiveSection);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("hashchange", updateActiveSection);
    };
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerCloseRef.current?.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setDrawerOpen(false);
        window.requestAnimationFrame(() => drawerTriggerRef.current?.focus({ preventScroll: true }));
        return;
      }

      if (event.key !== "Tab") return;
      const drawer = document.getElementById(drawerId);
      const focusable = drawer?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (drawer && !drawer.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerId, drawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    window.requestAnimationFrame(() => drawerTriggerRef.current?.focus({ preventScroll: true }));
  };
  const telegramSupportUrl = validSocialUrl(SOCIAL_URLS.telegram);

  return (
    <header className={`${styles.header} public-navbar`}>
      <a href="#main-content" className="skip-link">Skip to content</a>
      <div className={styles.shell}>
        <Link href="/" aria-label="SakSuuu Home" className={styles.brand}>
          <Image
            src={resolvedLogoUrl || "/images/logo.png"}
            alt=""
            width={44}
            height={44}
            priority
            className={styles.logo}
          />
          <span aria-hidden="true" className={styles.wordmark}>
            <span className={`${styles.wordmarkText} ${brandTyping ? styles.wordmarkTyping : ""}`}>
              SakSuuu
            </span>
          </span>
        </Link>

        <nav aria-label="Primary navigation" className={styles.primaryNav}>
          {navLinks.map(({ href, label }) => {
            const active = isCurrentPage(pathname, href, activeHomeSection);
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
          <Link
            href="/games#game-search"
            className={styles.searchButton}
            aria-label="Search games"
            title="Search games"
          >
            <Search aria-hidden="true" />
          </Link>
          {telegramSupportUrl ? (
            <a
              href={telegramSupportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.searchButton} ${styles.telegramButton}`}
              aria-label="Telegram support (opens in a new tab)"
              title="Telegram support"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
                <path d={telegramIconPath} />
              </svg>
            </a>
          ) : null}
          <button
            ref={drawerTriggerRef}
            type="button"
            className={styles.menuButton}
            aria-label="Open navigation menu"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            aria-controls={drawerOpen ? drawerId : undefined}
            title="Menu"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu aria-hidden="true" />
          </button>
        </div>
      </div>

      {drawerOpen && (
        <div className={styles.drawerLayer}>
          <button
            type="button"
            className={styles.drawerBackdrop}
            onClick={closeDrawer}
            aria-label="Close navigation menu"
          />
          <aside
            id={drawerId}
            role="dialog"
            aria-modal="true"
            aria-label="Site menu"
            className={styles.drawer}
          >
            <div className={styles.drawerHeader}>
              <Link href="/" className={styles.drawerBrand} aria-label="SakSuuu Home" onClick={closeDrawer}>
                <Image src={resolvedLogoUrl || "/images/logo.png"} alt="" width={38} height={38} />
                <span aria-hidden="true" className={styles.drawerWordmark}>
                  <span>Sak</span><strong>Suuu</strong>
                </span>
              </Link>
              <button
                ref={drawerCloseRef}
                type="button"
                className={styles.drawerClose}
                onClick={closeDrawer}
                aria-label="Close navigation menu"
                title="Close menu"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <nav aria-label="Menu navigation" className={styles.drawerNav}>
              {navLinks.map(({ href, label, Icon }) => {
                const active = isCurrentPage(pathname, href, activeHomeSection);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={closeDrawer}
                    aria-current={active ? "page" : undefined}
                    className={`${styles.drawerLink} ${active ? styles.drawerLinkActive : ""}`}
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </nav>

            <section className={styles.drawerSocials} aria-labelledby={`${drawerId}-socials-title`}>
              <h2 id={`${drawerId}-socials-title`} className={styles.drawerSectionTitle}>Social &amp; support</h2>
              <div className={styles.drawerSocialList}>
                {drawerSocialLinks.map(({ label, href, path }) => (
                  <a
                    key={label}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={closeDrawer}
                    className={styles.drawerSocialLink}
                    aria-label={`${label} (opens in a new tab)`}
                  >
                    <span className={styles.drawerSocialIcon}>
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d={path} /></svg>
                    </span>
                    <span>{label}</span>
                  </a>
                ))}
                <Link
                  href="/orders"
                  onClick={closeDrawer}
                  className={styles.drawerSocialLink}
                  aria-label="Customer support and order help"
                >
                  <span className={styles.drawerSocialIcon}><Headphones aria-hidden="true" /></span>
                  <span>Support</span>
                </Link>
              </div>
            </section>
          </aside>
        </div>
      )}
    </header>
  );
}
