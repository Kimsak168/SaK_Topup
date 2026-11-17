"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Script from "next/script";

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

interface TelegramMiniAppContextValue {
  isTelegramMiniApp: boolean;
  user: TelegramWebAppUser | null;
}

const TelegramMiniAppContext = createContext<TelegramMiniAppContextValue>({
  isTelegramMiniApp: false,
  user: null,
});

export function useTelegramMiniApp() {
  return useContext(TelegramMiniAppContext);
}

interface TelegramWebAppInstance {
  initData?: string;
  initDataUnsafe?: {
    user?: TelegramWebAppUser;
    start_param?: string;
  };
  platform?: string;
  version?: string;
  isExpanded?: boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  BackButton?: {
    isVisible: boolean;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebAppInstance;
    };
  }
}

export function TelegramMiniAppProvider({ children }: { children: React.ReactNode }) {
  const [isTelegramMiniApp, setIsTelegramMiniApp] = useState(false);
  const [user, setUser] = useState<TelegramWebAppUser | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const initTelegramWebApp = () => {
    if (typeof window === "undefined") return;
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;

    // Detect if actually running inside Telegram WebApp environment
    const hasInitData = Boolean(webApp.initData && webApp.initData.length > 0);
    const tgUser = webApp.initDataUnsafe?.user || null;

    if (hasInitData || tgUser) {
      setIsTelegramMiniApp(true);
      if (tgUser) {
        setUser(tgUser);
        try {
          sessionStorage.setItem("asura_tg_user", JSON.stringify(tgUser));
        } catch {
          // ignore storage errors
        }
      }
    }

    try {
      webApp.ready();
      webApp.expand();
      if (typeof webApp.setHeaderColor === "function") {
        webApp.setHeaderColor("#FFF9FC");
      }
      if (typeof webApp.setBackgroundColor === "function") {
        webApp.setBackgroundColor("#FFF9FC");
      }
    } catch {
      // ignore unsupported WebApp version methods
    }
  };

  useEffect(() => {
    initTelegramWebApp();
  }, [scriptLoaded]);

  // Sync Next.js route navigation with Telegram's native BackButton
  useEffect(() => {
    if (typeof window === "undefined") return;
    const webApp = window.Telegram?.WebApp;
    const backButton = webApp?.BackButton;
    if (!backButton || !isTelegramMiniApp) return;

    const handleBack = () => {
      if (window.history.length > 1) {
        router.back();
      } else {
        router.push("/");
      }
    };

    try {
      if (pathname && pathname !== "/") {
        backButton.show();
        backButton.onClick(handleBack);
      } else {
        backButton.hide();
      }
    } catch {
      // ignore older client errors
    }

    return () => {
      try {
        backButton.offClick(handleBack);
      } catch {
        // ignore
      }
    };
  }, [pathname, isTelegramMiniApp, router]);

  return (
    <TelegramMiniAppContext.Provider value={{ isTelegramMiniApp, user }}>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      {children}
    </TelegramMiniAppContext.Provider>
  );
}
