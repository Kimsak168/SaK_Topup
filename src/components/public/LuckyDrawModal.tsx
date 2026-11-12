"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";

const LuckyDrawWheel = dynamic(
  () => import("./LuckyDrawWheel").then((module) => module.LuckyDrawWheel),
  { loading: () => <p role="status" className="p-8 text-center text-sm text-white">Loading lucky draw...</p> },
);

interface OpenLuckyDrawDetail {
  orderNumber?: string;
}

export function LuckyDrawModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<string | undefined>(undefined);
  const [inputOrder, setInputOrder] = useState("");
  const [showOrderInput, setShowOrderInput] = useState(false);

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

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Lucky Draw Wheel Modal"
      className="lucky-draw-modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
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
              className="lucky-draw-order-form rounded-2xl border border-sky-400/30 bg-[#0B0F19]/90 backdrop-blur-md p-2 flex gap-1.5 shadow-lg animate-in fade-in"
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
  );
}

