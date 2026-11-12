"use client";

import { usePathname } from "next/navigation";
import { SOCIAL_URLS } from "@/lib/socialLinks";
import styles from "./TelegramSupportWidget.module.css";

const telegramIconPath =
  "M9.78 15.43 9.4 20.8c.54 0 .78-.23 1.06-.51l2.55-2.44 5.29 3.87c.97.54 1.67.26 1.91-.9L23.67 4c.35-1.44-.55-2.09-1.48-1.67L1.84 10.18c-1.39.56-1.38 1.33-.25 1.67l5.22 1.63L18.9 5.86c.57-.35 1.09-.16.66.23Z";

function getTelegramSupportUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "http:") return url.href;
  } catch {
    // Do not render a link if its configured destination is malformed.
  }
}

export function TelegramSupportWidget() {
  const pathname = usePathname();
  const href = getTelegramSupportUrl(SOCIAL_URLS.telegram);

  const aboveMobileCheckoutBar =
    pathname.startsWith("/game") ||
    pathname.startsWith("/services") ||
    pathname.startsWith("/checkout");

  const handleOpenLuckyDraw = () => {
    window.dispatchEvent(new CustomEvent("open-lucky-draw"));
  };

  return (
    <aside
      aria-label="Floating support and lucky draw tools"
      className={`${styles.widget} ${aboveMobileCheckoutBar ? styles.aboveMobileCheckoutBar : ""}`}
    >
      {/* 1. Lucky Draw Floating Widget (Stacked right with Telegram, matching size & speech bubble) */}
      <div className={styles.widgetGroup}>
        <span className={styles.luckySpeechBubble} lang="km" aria-hidden="true">
          កង់សំណាង
        </span>
        <span className={styles.buttonFloatLucky}>
          <button
            type="button"
            onClick={handleOpenLuckyDraw}
            className={styles.luckyButton}
            aria-label="Open Lucky Draw Wheel"
            title="កង់សំណាង · Lucky Draw (Free Daily Spin)"
          >
            <div className={styles.luckyIconWrapper}>
              {/* Spinning colorful wheel slices */}
              <svg
                viewBox="0 0 48 48"
                className={styles.luckyWheelSvg}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <circle cx="24" cy="24" r="20" fill="#1E1B4B" />
                <path d="M24 24 L24 4 A20 20 0 0 1 38.14 9.86 Z" fill="#EF4444" />
                <path d="M24 24 L38.14 9.86 A20 20 0 0 1 44 24 Z" fill="#F59E0B" />
                <path d="M24 24 L44 24 A20 20 0 0 1 38.14 38.14 Z" fill="#10B981" />
                <path d="M24 24 L38.14 38.14 A20 20 0 0 1 24 44 Z" fill="#06B6D4" />
                <path d="M24 24 L24 44 A20 20 0 0 1 9.86 38.14 Z" fill="#3B82F6" />
                <path d="M24 24 L9.86 38.14 A20 20 0 0 1 4 24 Z" fill="#8B5CF6" />
                <path d="M24 24 L4 24 A20 20 0 0 1 9.86 9.86 Z" fill="#EC4899" />
                <path d="M24 24 L9.86 9.86 A20 20 0 0 1 24 4 Z" fill="#F97316" />
                <circle cx="24" cy="24" r="20" stroke="#F59E0B" strokeWidth="2" fill="none" />
                <circle cx="24" cy="24" r="5" fill="#FBBF24" stroke="#FFF" strokeWidth="1.2" />
                <circle cx="24" cy="24" r="2" fill="#78350F" />
              </svg>
              {/* Stationary red pointer arrow on top */}
              <svg
                viewBox="0 0 48 48"
                className={styles.luckyPointerSvg}
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <polygon points="24,2 27.5,8.5 20.5,8.5" fill="#EF4444" stroke="#FFFFFF" strokeWidth="0.8" />
              </svg>
            </div>
          </button>
        </span>
      </div>

      {/* 2. Telegram Support Widget */}
      {href && (
        <div className={styles.widgetGroup}>
          <span className={styles.speechBubble} lang="km" aria-hidden="true">
            ទំនាក់ទំនង
          </span>
          <span className={styles.buttonFloat}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.telegramButton}
              aria-label="Contact Asura Store Support on Telegram"
              title="Contact Asura Store Support on Telegram"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" className={styles.telegramIcon}>
                <path d={telegramIconPath} />
              </svg>
            </a>
          </span>
        </div>
      )}
    </aside>
  );
}
