"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { X, Trophy, Gift, Search, Sparkles } from "lucide-react";
import { LuckyDrawWheel } from "./LuckyDrawWheel";

interface OpenLuckyDrawDetail {
  orderNumber?: string;
}

export function LuckyDrawModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<string | undefined>(undefined);
  const [inputOrder, setInputOrder] = useState("");
  const [showOrderInput, setShowOrderInput] = useState(false);
  const pathname = usePathname();

  // Listen for global custom event "open-lucky-draw"
  useEffect(() => {
    const handleOpen = (e: Event) => {
      const customEvent = e as CustomEvent<OpenLuckyDrawDetail>;
      if (customEvent.detail?.orderNumber) {
        setActiveOrder(customEvent.detail.orderNumber);
        setInputOrder(customEvent.detail.orderNumber);
      }
      setIsOpen(true);
    };

    window.addEventListener("open-lucky-draw", handleOpen as EventListener);
    return () => window.removeEventListener("open-lucky-draw", handleOpen as EventListener);
  }, []);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputOrder.trim();
    if (clean) {
      setActiveOrder(clean);
      setShowOrderInput(false);
    }
  };

  const handleSwitchToFree = () => {
    setActiveOrder(undefined);
    setInputOrder("");
    setShowOrderInput(false);
  };

  const aboveMobileCheckoutBar =
    pathname.startsWith("/game") ||
    pathname.startsWith("/services") ||
    pathname.startsWith("/digital-shop") ||
    pathname.startsWith("/checkout");

  return (
    <>
      {/* 1. Floating Trigger Button (Bottom-Left) */}
      <div
        className={`fixed z-40 left-4 sm:left-6 transition-all duration-300 pointer-events-auto ${
          aboveMobileCheckoutBar
            ? "bottom-[calc(80px+env(safe-area-inset-bottom,0px))] md:bottom-[calc(20px+env(safe-area-inset-bottom,0px))]"
            : "bottom-[calc(20px+env(safe-area-inset-bottom,0px))]"
        }`}
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-gradient-to-r from-amber-500 via-pink-600 to-purple-600 text-white font-black text-xs shadow-lg shadow-pink-500/30 hover:shadow-pink-500/50 hover:scale-105 active:scale-95 transition-all cursor-pointer border border-amber-300/40"
          aria-label="Open Lucky Draw Wheel"
        >
          {/* Pulsing neon glow aura */}
          <span className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-amber-400 to-pink-500 blur-sm opacity-60 group-hover:opacity-100 animate-pulse -z-10" />

          <span
            className="text-base leading-none inline-block animate-spin"
            style={{ animationDuration: "6s" }}
          >
            🎡
          </span>
          <span className="tracking-wide hidden xs:inline">Lucky Draw</span>
          <span className="px-1.5 py-0.5 rounded-full bg-black/40 text-[9px] font-extrabold text-amber-300 border border-amber-400/30">
            FREE SPIN
          </span>
        </button>
      </div>

      {/* 2. Small Pop-up Modal Dialog */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Lucky Draw Wheel Modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div className="relative w-full max-w-[350px] animate-in zoom-in-95 duration-200">
            {/* Embedded Compact Wheel */}
            <LuckyDrawWheel
              orderNumber={activeOrder}
              wheelSize={230}
              isCompact={true}
              onClose={() => setIsOpen(false)}
              title={activeOrder ? `Order: ${activeOrder}` : "Lucky Draw"}
            />

            {/* Order Claim Toggle / Switch */}
            <div className="mt-2.5 text-center">
              {showOrderInput ? (
                <form
                  onSubmit={handleOrderSubmit}
                  className="rounded-2xl border border-sky-400/30 bg-[#0B0F19]/90 backdrop-blur-md p-2 flex gap-1.5 shadow-lg animate-in fade-in"
                >
                  <input
                    type="text"
                    placeholder="Order # (e.g. ORD-...)"
                    value={inputOrder}
                    onChange={(e) => setInputOrder(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-xl border border-white/15 bg-black/60 text-white placeholder-slate-500 text-[11px] font-mono focus:outline-none focus:border-amber-400"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] cursor-pointer"
                  >
                    Check
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowOrderInput(false)}
                    className="px-2 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 text-[11px] cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              ) : activeOrder ? (
                <button
                  type="button"
                  onClick={handleSwitchToFree}
                  className="text-[11px] text-sky-400 hover:text-sky-300 underline underline-offset-2 cursor-pointer font-medium"
                >
                  Switch to Daily Free Spin
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowOrderInput(true)}
                  className="text-[11px] text-slate-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer transition-colors"
                >
                  Have an order number? Click for bonus spin
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
