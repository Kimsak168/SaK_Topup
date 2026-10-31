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

  if (!href) return null;

  const aboveMobileCheckoutBar = pathname.startsWith("/services/");

  return (
    <div
      className={`${styles.widget} ${aboveMobileCheckoutBar ? styles.aboveMobileCheckoutBar : ""}`}
    >
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
  );
}
