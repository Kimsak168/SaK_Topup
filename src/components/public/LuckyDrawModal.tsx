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
      className="lucky-draw-modal fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-[#2D1A26]/65 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) setIsOpen(false);
      }}
    >
      <div className="relative w-full max-w-[360px] animate-in zoom-in-95 duration-200">
        {/* Embedded Compact Wheel */}
        <LuckyDrawWheel
          orderNumber={activeOrder}
          wheelSize={256}
          isCompact={true}
          onClose={() => setIsOpen(false)}
          title={activeOrder ? `Order: ${activeOrder}` : "Lucky Draw"}
        />

        {/* Order Claim Toggle / Switch */}
        <div className="mt-2.5 text-center">
          {showOrderInput ? (
            <form
              onSubmit={handleOrderSubmit}
              className="lucky-draw-order-form rounded-2xl border border-[#F0C6DA] bg-white/95 backdrop-blur-md p-2 flex gap-1.5 shadow-lg animate-in fade-in"
            >
              <input
                type="text"
                placeholder="Order # (e.g. ASURA-...)"
                value={inputOrder}
                onChange={(e) => setInputOrder(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-xl border border-[#E4C6D4] bg-[#FFF9FC] text-[#332733] placeholder-[#705B68]/70 text-[11px] font-mono focus:outline-none focus:border-[#BE185D]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#BE185D] hover:from-[#BE185D] hover:to-[#9D174D] text-white font-bold text-[11px] cursor-pointer"
              >
                Check
              </button>
              <button
                type="button"
                onClick={() => setShowOrderInput(false)}
                className="px-2.5 py-1.5 rounded-xl bg-[#FCF0F5] hover:bg-[#F7DFEA] text-[#705B68] text-[11px] font-semibold cursor-pointer"
              >
                Cancel
              </button>
            </form>
          ) : activeOrder ? (
            <button
              type="button"
              onClick={handleSwitchToFree}
              className="inline-flex items-center rounded-full border border-[#F0C6DA] bg-white/95 px-3.5 py-1.5 text-[11px] font-semibold text-[#BE185D] hover:bg-[#FCF0F5] shadow-sm cursor-pointer transition-colors"
            >
              Switch to Daily Free Spin
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowOrderInput(true)}
              className="inline-flex items-center rounded-full border border-[#F0C6DA] bg-white/95 px-3.5 py-1.5 text-[11px] font-semibold text-[#5C4754] hover:text-[#BE185D] hover:border-[#DB2777]/50 shadow-sm cursor-pointer transition-colors"
            >
              Have an order number? Click for bonus spin
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

