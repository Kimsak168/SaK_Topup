"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Check, Search, Trophy, ShoppingBag, ArrowRight } from "lucide-react";

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
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    }
  };

  const handleResetOrder = () => {
    setActiveOrder(undefined);
    setInputOrder("");
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buyer Lucky Draw Wheel Modal"
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
          title={activeOrder ? `Order: ${activeOrder}` : "Buyer Lucky Draw"}
          onRequestOrderInput={() => inputRef.current?.focus()}
        />

        {/* Order Verification Section (Buyer Exclusive) */}
        <div className="mt-2.5">
          {activeOrder ? (
            <div className="text-center">
              <button
                type="button"
                onClick={handleResetOrder}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#F0C6DA] bg-white/95 px-3.5 py-1.5 text-[11px] font-bold text-[#BE185D] hover:bg-[#FCF0F5] shadow-xs cursor-pointer transition-colors"
              >
                <span>Change Order Number</span>
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-[#F0C6DA] bg-white/95 backdrop-blur-md p-3 shadow-md space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-[#BE185D] flex items-center gap-1">
                  <Trophy className="size-3.5 text-[#DB2777]" />
                  <span>Enter Paid Order Number</span>
                </span>
                <span className="text-[10px] text-[#705B68] font-bold uppercase tracking-wider">
                  Buyer Spin
                </span>
              </div>

              <form onSubmit={handleOrderSubmit} className="flex gap-1.5">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Order # (e.g. ASURA-...)"
                  value={inputOrder}
                  onChange={(e) => setInputOrder(e.target.value)}
                  className="flex-1 px-2.5 py-1.5 rounded-xl border border-[#E4C6D4] bg-[#FFF9FC] text-[#332733] placeholder-[#705B68]/70 text-[11px] font-mono focus:outline-none focus:border-[#BE185D]"
                />
                <button
                  type="submit"
                  disabled={!inputOrder.trim()}
                  className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#DB2777] to-[#BE185D] hover:from-[#BE185D] hover:to-[#9D174D] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-[11px] cursor-pointer shadow-xs shadow-pink-500/20 shrink-0"
                >
                  Verify
                </button>
              </form>

              <div className="pt-0.5 flex items-center justify-between text-[10px]">
                <span className="text-[#705B68]">Exclusive for top-up clients</span>
                <Link
                  href="/"
                  onClick={() => setIsOpen(false)}
                  className="text-[#BE185D] font-bold hover:underline inline-flex items-center gap-0.5"
                >
                  <span>Top Up Games</span>
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
