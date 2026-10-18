"use client";

import { useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { ArrowUp, ChevronDown, Headphones, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { Tooltip } from "@base-ui/react/tooltip";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { SOCIAL_URLS } from "@/lib/socialLinks";
import styles from "./SupportDropdown.module.css";

function validSocialUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    // Missing or malformed social destinations are omitted.
  }
}

const socialLinks = [
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
  {
    label: "Discord",
    href: SOCIAL_URLS.discord,
    path: "M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515c-.211.379-.457.889-.626 1.295a18.27 18.27 0 0 0-5.416 0 12.64 12.64 0 0 0-.634-1.295A19.736 19.736 0 0 0 3.87 4.37C.78 8.936-.056 13.39.362 17.78a19.9 19.9 0 0 0 5.993 3.03c.483-.658.914-1.352 1.286-2.084a12.98 12.98 0 0 1-2.025-.975c.17-.124.337-.255.498-.39a14.2 14.2 0 0 0 12.075 0c.162.135.329.266.498.39a13 13 0 0 1-2.029.977c.373.731.803 1.425 1.286 2.083a19.84 19.84 0 0 0 5.996-3.03c.491-5.09-.838-9.503-3.623-13.41ZM8.02 15.095c-1.182 0-2.153-1.085-2.153-2.419 0-1.333.95-2.419 2.153-2.419 1.203 0 2.175 1.096 2.154 2.419 0 1.334-.951 2.419-2.154 2.419Zm7.96 0c-1.183 0-2.154-1.085-2.154-2.419 0-1.333.95-2.419 2.154-2.419 1.203 0 2.174 1.096 2.153 2.419 0 1.334-.95 2.419-2.153 2.419Z",
  },
  {
    label: "YouTube",
    href: SOCIAL_URLS.youtube,
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.016 3.016 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.121 2.136c1.872.505 9.377.505 9.377.505s7.505 0 9.376-.505a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814ZM9.545 15.568V8.432L15.818 12l-6.273 3.568Z",
  },
].flatMap((link) => {
  const href = validSocialUrl(link.href);
  return href ? [{ ...link, href }] : [];
});

const supportLinks = socialLinks.filter(({ label }) =>
  label === "Telegram" || label === "Facebook" || label === "TikTok",
);

function ToolbarTooltip({ label, open, children }: { label: string; open: boolean; children: ReactElement }) {
  const tooltipId = useId();

  return (
    <Tooltip.Root disabled={!open}>
      <Tooltip.Trigger aria-describedby={tooltipId} render={children} />
      <Tooltip.Portal>
        <Tooltip.Positioner side="left" sideOffset={12} collisionPadding={8} className={styles.tooltipPositioner}>
          <Tooltip.Popup id={tooltipId} role="tooltip" className={styles.tooltip}>{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function SupportDropdown({ logoUrl }: { logoUrl?: string } = {}) {
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const containerRef = useRef<HTMLDivElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const supportButtonRef = useRef<HTMLButtonElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const toolbarId = useId();
  const supportMenuId = useId();
  const supportUrl = validSocialUrl(SOCIAL_URLS.telegram);

  useEffect(() => {
    setPortalContainer(document.body);
  }, []);

  useEffect(() => {
    if (!toolbarOpen && !supportOpen) return;

    function closeIfOutside(event: PointerEvent | FocusEvent) {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target) &&
        !railRef.current?.contains(event.target)
      ) {
        setToolbarOpen(false);
        setSupportOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setToolbarOpen(false);
        setSupportOpen(false);
        (toolbarOpen ? settingsButtonRef : supportButtonRef).current?.focus({ preventScroll: true });
      }
    }

    if (toolbarOpen) {
      railRef.current?.querySelector<HTMLAnchorElement>("a[href]")?.focus({ preventScroll: true });
    }

    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("focusin", closeIfOutside);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("focusin", closeIfOutside);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [toolbarOpen, supportOpen]);

  return (
    <div ref={containerRef} className={styles.controls}>
      <button
        ref={settingsButtonRef}
        type="button"
        aria-expanded={toolbarOpen}
        aria-controls={toolbarId}
        aria-label={toolbarOpen ? "Close social toolbar" : "Open social toolbar"}
        title={toolbarOpen ? "Close social toolbar" : "Open social toolbar"}
        onClick={() => {
          setSupportOpen(false);
          setToolbarOpen((current) => !current);
        }}
        className={`${styles.controlButton} ${styles.settingsButton}`}
      >
        <SlidersHorizontal aria-hidden="true" />
      </button>

      <div className={styles.supportControl}>
        <button
          ref={supportButtonRef}
          type="button"
          aria-haspopup="true"
          aria-expanded={supportOpen}
          aria-controls={supportMenuId}
          aria-label="Support"
          onClick={() => {
            setToolbarOpen(false);
            setSupportOpen((current) => !current);
          }}
          className={`${styles.controlButton} ${styles.supportButton}`}
        >
          <Headphones aria-hidden="true" />
          <span className={styles.supportLabel}>Support</span>
          <ChevronDown aria-hidden="true" className={supportOpen ? styles.chevronOpen : ""} />
        </button>

        <div
          id={supportMenuId}
          data-open={supportOpen}
          aria-hidden={!supportOpen}
          inert={!supportOpen}
          className={styles.supportMenu}
        >
          <p className={styles.menuHeading}>Contact us</p>
          {supportLinks.length > 0 ? (
            <ul className={styles.supportList}>
              {supportLinks.map(({ label, href, path }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${label} support (opens in a new tab)`}
                    onClick={() => setSupportOpen(false)}
                    className={styles.supportLink}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={styles.supportIcon}>
                      <path d={path} />
                    </svg>
                    <span>{label}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.noSupportLinks}>Support links are not configured yet.</p>
          )}
        </div>
      </div>

      {portalContainer && createPortal(
        <Tooltip.Provider delay={150}>
          <nav
            ref={railRef}
            id={toolbarId}
            aria-label="Social and settings toolbar"
            inert={!toolbarOpen}
            aria-hidden={!toolbarOpen}
            data-open={toolbarOpen}
            className={styles.rail}
          >
            <ToolbarTooltip label="SakSuuu Home" open={toolbarOpen}>
              <Link href="/" aria-label="SakSuuu Home" className={styles.action + " " + styles.logo}>
                <Image
                  src={logoUrl || "/images/logo.png"}
                  alt=""
                  width={32}
                  height={32}
                  className={styles.logoImage}
                />
              </Link>
            </ToolbarTooltip>
            {socialLinks.length > 0 && (
              <ul aria-label="Social links" className={styles.section + " " + styles.socials}>
                {socialLinks.map(({ label, href, path }) => (
                  <li key={label}>
                    <ToolbarTooltip label={label} open={toolbarOpen}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={label + " (opens in a new tab)"}
                        data-active={activeAction === label}
                        onClick={() => setActiveAction(label)}
                        className={styles.action}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={styles.icon}>
                          <path d={path} />
                        </svg>
                      </a>
                    </ToolbarTooltip>
                  </li>
                ))}
              </ul>
            )}
            <div aria-hidden="true" className={styles.divider} />
            <ul aria-label="Toolbar utilities" className={styles.section}>
              <li>
                <ToolbarTooltip label="Support" open={toolbarOpen}>
                  {supportUrl ? (
                    <a
                      href={supportUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Support (opens in a new tab)"
                      data-active={activeAction === "Support"}
                      onClick={() => setActiveAction("Support")}
                      className={styles.action}
                    >
                      <Headphones aria-hidden="true" className={styles.icon} />
                    </a>
                  ) : (
                    <button type="button" aria-label="Support" className={styles.action} onClick={() => toast.error("Link unavailable", { id: "support-link" })}>
                      <Headphones aria-hidden="true" className={styles.icon} />
                    </button>
                  )}
                </ToolbarTooltip>
              </li>
              <li>
                <ToolbarTooltip label="Change Theme" open={toolbarOpen}>
                  <button
                    type="button"
                    aria-label={isDark ? "Change Theme (dark mode, switch to light)" : "Change Theme (light mode, switch to dark)"}
                    data-active={activeAction === "Theme"}
                    onClick={() => {
                      setTheme(isDark ? "light" : "dark");
                      setActiveAction("Theme");
                    }}
                    className={styles.action}
                  >
                    {isDark ? <Moon aria-hidden="true" className={styles.icon} /> : <Sun aria-hidden="true" className={styles.icon} />}
                  </button>
                </ToolbarTooltip>
              </li>
              <li>
                <ToolbarTooltip label="Back to Top" open={toolbarOpen}>
                  <button
                    type="button"
                    aria-label="Back to Top"
                    data-active={activeAction === "Top"}
                    onClick={() => {
                      window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
                      setActiveAction("Top");
                    }}
                    className={styles.action}
                  >
                    <ArrowUp aria-hidden="true" className={styles.icon} />
                  </button>
                </ToolbarTooltip>
              </li>
            </ul>
          </nav>
        </Tooltip.Provider>,
        portalContainer,
      )}
    </div>
  );
}
