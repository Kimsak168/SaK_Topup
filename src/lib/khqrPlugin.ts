"use client";

/**
 * Official AnajakPay KHQRcc Checkout Plugin Wrapper
 * Manages loading https://anajakpay.com/khqrcc-plugin.js only once
 * and provides safe in-page checkout modal handling without full-page reloads.
 */

declare global {
  interface Window {
    KhqrPayway?: {
      openCheckout: (options: {
        checkout_url?: string;
        redirect?: string;
        onSuccess?: (response: unknown) => void;
        onError?: (error: unknown) => void;
      }) => void;
      closeCheckout: (confirmPrompt?: boolean) => void;
      _doClose?: () => void;
      closeCheckoutByContinueUrl?: () => void;
    };
    khqrCheckoutSetSheetHeight?: (height: number) => void;
    khqrCheckoutSetIsSheetShown?: (isShown: boolean) => void;
  }
}

const PLUGIN_SCRIPT_URL = "https://anajakpay.com/khqrcc-plugin.js";
let scriptLoadingPromise: Promise<boolean> | null = null;
let captureMessageListenerAttached = false;
let activeCloseCallback: (() => void) | null = null;
let activeFloatingCloseBtn: HTMLElement | null = null;
let escapeKeyListener: ((e: KeyboardEvent) => void) | null = null;

/**
 * Sets up a capture-phase window message listener.
 * The official khqrcc-plugin.js script listens for `message` and reloads the entire page on `{ close: true }`.
 * By handling it in capture phase (`useCapture = true`), we catch the event before the plugin's listener,
 * call `stopImmediatePropagation()`, and close the in-page checkout cleanly while keeping the customer on the page.
 */
function setupCaptureMessageListener() {
  if (typeof window === "undefined" || captureMessageListenerAttached) return;

  window.addEventListener(
    "message",
    (e) => {
      const data = e.data;
      if (data && typeof data === "object") {
        if (data.type !== "khqrcc_deeplink" && (data.close || data.action === "close")) {
          e.stopImmediatePropagation();
          closeKhqrInPageCheckout();
        }
      }
    },
    true
  );

  captureMessageListenerAttached = true;
}

/**
 * Load the official AnajakPay checkout plugin only once into document.head.
 */
export function loadKhqrPluginScript(): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  if (window.KhqrPayway) {
    patchPluginCloseBehavior();
    return Promise.resolve(true);
  }

  if (scriptLoadingPromise) {
    return scriptLoadingPromise;
  }

  scriptLoadingPromise = new Promise((resolve) => {
    // Check if script element already exists
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src*="khqrcc-plugin.js"]`
    );

    if (existing) {
      if (window.KhqrPayway) {
        patchPluginCloseBehavior();
        resolve(true);
        return;
      }
      existing.addEventListener(
        "load",
        () => {
          patchPluginCloseBehavior();
          resolve(true);
        },
        { once: true }
      );
      existing.addEventListener("error", () => resolve(false), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = PLUGIN_SCRIPT_URL;
    script.async = true;

    script.onload = () => {
      console.log("[AnajakPay] KHQRcc checkout plugin loaded successfully.");
      patchPluginCloseBehavior();
      resolve(true);
    };

    script.onerror = (err) => {
      console.error("[AnajakPay] Failed to load official KHQRcc checkout plugin:", err);
      scriptLoadingPromise = null;
      resolve(false);
    };

    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

/**
 * Overrides the plugin's default location.reload() on close so the customer
 * stays on the existing SakSuuu game page with their inputs preserved.
 */
function patchPluginCloseBehavior() {
  if (typeof window === "undefined") return;

  setupCaptureMessageListener();

  if (window.KhqrPayway) {
    window.KhqrPayway.closeCheckout = function (confirmPrompt?: boolean) {
      if (confirmPrompt) {
        const confirmed = window.confirm("Do you want to close the KHQR payment window?");
        if (!confirmed) return;
      }
      closeKhqrInPageCheckout();
    };
  }

  // Mobile overlay click patch: replace overlay element to detach plugin's default reload listener
  const sheet = document.getElementById("khqr_checkout_sheet");
  if (sheet) {
    const overlay = sheet.querySelector(".khqr_checkout_overlay");
    if (overlay && overlay.parentNode && !overlay.getAttribute("data-saksuuu-patched")) {
      const cleanOverlay = overlay.cloneNode(true) as HTMLElement;
      cleanOverlay.setAttribute("data-saksuuu-patched", "true");
      cleanOverlay.addEventListener("click", () => {
        const confirmed = window.confirm("Do you want to close this checkout?");
        if (confirmed) {
          closeKhqrInPageCheckout();
        }
      });
      overlay.parentNode.replaceChild(cleanOverlay, overlay);
    }
  }
}

function showFloatingCloseButton(onCloseCallback?: () => void) {
  removeFloatingCloseButton();

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "saksuuu-khqr-close-btn";
  btn.setAttribute("aria-label", "Close KHQR Payment Checkout");
  btn.innerHTML = `
    <span style="font-size: 14px; line-height: 1;">✕</span>
    <span>Close Payment Window</span>
  `;

  // Accessible, high-contrast floating button above the checkout modal
  Object.assign(btn.style, {
    position: "fixed",
    top: "16px",
    right: "16px",
    zIndex: "2147483647", // Maximum z-index
    backgroundColor: "rgba(12, 14, 36, 0.94)",
    color: "#ffffff",
    border: "1px solid rgba(255, 46, 147, 0.5)",
    boxShadow: "0 0 25px rgba(0, 0, 0, 0.7), 0 0 12px rgba(255, 46, 147, 0.3)",
    borderRadius: "9999px",
    padding: "9px 18px",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "0.025em",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    backdropFilter: "blur(10px)",
    transition: "all 0.2s ease",
  });

  btn.onmouseenter = () => {
    btn.style.backgroundColor = "rgba(255, 46, 147, 0.95)";
    btn.style.borderColor = "#ff2e93";
    btn.style.transform = "scale(1.03)";
  };
  btn.onmouseleave = () => {
    btn.style.backgroundColor = "rgba(12, 14, 36, 0.94)";
    btn.style.borderColor = "rgba(255, 46, 147, 0.5)";
    btn.style.transform = "scale(1)";
  };

  btn.onclick = () => {
    const confirmed = window.confirm(
      "Do you want to close the KHQR payment window? Your pending order will be saved."
    );
    if (confirmed) {
      closeKhqrInPageCheckout();
      if (onCloseCallback) onCloseCallback();
    }
  };

  document.body.appendChild(btn);
  activeFloatingCloseBtn = btn;
}

function removeFloatingCloseButton() {
  if (activeFloatingCloseBtn && activeFloatingCloseBtn.parentNode) {
    activeFloatingCloseBtn.parentNode.removeChild(activeFloatingCloseBtn);
  }
  activeFloatingCloseBtn = null;

  const stray = document.getElementById("saksuuu-khqr-close-btn");
  if (stray && stray.parentNode) {
    stray.parentNode.removeChild(stray);
  }
}

/**
 * Safely closes the in-page checkout modal without reloading the page.
 */
export function closeKhqrInPageCheckout() {
  removeFloatingCloseButton();

  if (escapeKeyListener && typeof window !== "undefined") {
    window.removeEventListener("keydown", escapeKeyListener);
    escapeKeyListener = null;
  }

  if (typeof window === "undefined") return;

  try {
    // 1. Desktop cleanup
    const desktopModal = document.getElementById("khqr-checkout");
    if (desktopModal) {
      desktopModal.style.display = "none";
      desktopModal.innerHTML = "";
      desktopModal.className = "";
    }

    // 2. Mobile cleanup
    const mobileSheet = document.getElementById("khqr_checkout_sheet");
    if (mobileSheet) {
      mobileSheet.setAttribute("aria-hidden", "true");
      mobileSheet.style.display = "none";
      const mobileApp = document.getElementById("khqr_checkout_app");
      if (mobileApp) {
        mobileApp.innerHTML = "";
        mobileApp.className = "khqr_checkout_column";
      }
    }

    // 3. Fallback to plugin's internal cleanup if available
    if (window.KhqrPayway?._doClose) {
      window.KhqrPayway._doClose();
    }

    document.body.style.overflowY = "visible";
  } catch (err) {
    console.error("[AnajakPay] Error during close cleanup:", err);
  }

  if (activeCloseCallback) {
    const cb = activeCloseCallback;
    activeCloseCallback = null;
    cb();
  }
}

export interface OpenKhqrCheckoutOptions {
  checkoutUrl: string;
  onSuccess?: (response: unknown) => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
}

export interface OpenCheckoutResult {
  opened: boolean;
  error?: string;
  diagnostic?: string;
}

/**
 * Opens the official AnajakPay KHQRcc checkout modal in-page.
 */
export async function openKhqrInPageCheckout(
  options: OpenKhqrCheckoutOptions
): Promise<OpenCheckoutResult> {
  if (typeof window === "undefined") {
    return { opened: false, error: "Window is undefined" };
  }

  if (!options.checkoutUrl || typeof options.checkoutUrl !== "string") {
    return {
      opened: false,
      error: "Missing checkout URL",
      diagnostic: "Backend did not return a valid signed checkout_url.",
    };
  }

  const isLoaded = await loadKhqrPluginScript();
  if (!isLoaded || !window.KhqrPayway) {
    console.error("[AnajakPay] KhqrPayway plugin object is unavailable.");
    return {
      opened: false,
      error: "Payment plugin failed to load",
      diagnostic:
        "Unable to load https://anajakpay.com/khqrcc-plugin.js. Please verify network connection or ad-blocker settings.",
    };
  }

  patchPluginCloseBehavior();
  activeCloseCallback = options.onClose || null;

  try {
    showFloatingCloseButton(() => {
      closeKhqrInPageCheckout();
    });

    // Register Escape key handler
    if (escapeKeyListener) {
      window.removeEventListener("keydown", escapeKeyListener);
    }
    escapeKeyListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const confirmed = window.confirm(
          "Do you want to close the KHQR payment window? Your pending order will be saved."
        );
        if (confirmed) {
          closeKhqrInPageCheckout();
        }
      }
    };
    window.addEventListener("keydown", escapeKeyListener);

    // Documented JavaScript interface invocation:
    // KhqrPayway.openCheckout({ checkout_url, onSuccess, onError })
    window.KhqrPayway.openCheckout({
      checkout_url: options.checkoutUrl,
      onSuccess: (res) => {
        console.log("[AnajakPay] Plugin onSuccess event received:", res);
        if (options.onSuccess) {
          options.onSuccess(res);
        }
      },
      onError: (err) => {
        console.warn("[AnajakPay] Plugin onError event received:", err);
        removeFloatingCloseButton();
        if (options.onError) {
          options.onError(err);
        }
      },
    });

    return { opened: true };
  } catch (error: unknown) {
    console.error("[AnajakPay] Failed to open in-page checkout:", error);
    removeFloatingCloseButton();
    return {
      opened: false,
      error: "Failed to open in-page payment modal",
      diagnostic: error instanceof Error ? error.message : "Plugin initialization failure",
    };
  }
}
