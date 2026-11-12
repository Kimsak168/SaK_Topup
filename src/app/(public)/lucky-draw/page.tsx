"use client";

import { useState } from "react";
import Link from "next/link";
import { Trophy, Gift, Sparkles, Search, CheckCircle2, Ticket, ArrowRight, ShieldCheck } from "lucide-react";
import { LuckyDrawWheel } from "@/components/public/LuckyDrawWheel";
import { LuckyDrawHeroBanner } from "@/components/public/LuckyDrawHeroBanner";
import { LUCKY_PRIZES } from "@/types/luckyDraw";

export default function LuckyDrawPage() {
  const [orderQuery, setOrderQuery] = useState("");
  const [activeOrder, setActiveOrder] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = orderQuery.trim();
    if (clean) {
      setActiveOrder(clean);
    }
  };

  return (
    <div className="min-h-screen py-8 sm:py-12 px-4 sm:px-6 max-w-5xl mx-auto space-y-10">
      {/* 1. Hero Showcase Banner */}
      <LuckyDrawHeroBanner />

      {/* 2. Interactive Wheel - Always Visible for Visitors & Customers */}
      <div id="wheel-section" className="pt-2 scroll-mt-28">
        <LuckyDrawWheel
          orderNumber={activeOrder || undefined}
          isOpen={true}
          title={activeOrder ? `Order Spin: ${activeOrder}` : "Daily Free Lucky Spin"}
        />
      </div>

      {/* Order Number Claim Form */}
      <div className="lucky-draw-order-form max-w-md mx-auto rounded-3xl border border-sky-400/30 bg-[#0B0F19]/90 backdrop-blur-xl p-5 sm:p-6 shadow-xl">
        <form onSubmit={handleSubmit} className="space-y-3">
          <label htmlFor="orderInput" className="block text-xs font-bold text-slate-300">
            Have a Paid Order? Enter Order Number for Bonus Spins:
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <input
                id="orderInput"
                type="text"
                placeholder="e.g. ORD-1730594..."
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-white/15 bg-black/60 text-white placeholder-slate-500 text-xs font-mono focus:outline-none focus:border-amber-400"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-pink-500 hover:from-amber-400 hover:to-pink-400 text-slate-950 font-black text-xs transition-all shadow-md shadow-pink-500/25 cursor-pointer shrink-0"
            >
              Verify &amp; Spin
            </button>
          </div>
          <p className="text-[11px] text-slate-400">
            Every paid top-up order unlocks 1 bonus spin with guaranteed rewards!
          </p>
        </form>
      </div>

      {/* Prize Showcase Grid */}
      <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-2">
          <Trophy className="size-5 text-amber-400" />
          <h2 className="text-lg sm:text-xl font-black text-white">
            Available Wheel Rewards
          </h2>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {LUCKY_PRIZES.map((prize) => (
            <div
              key={prize.id}
              className="rounded-2xl border border-white/10 bg-black/40 p-3.5 text-center space-y-1 hover:border-amber-400/50 transition-colors"
            >
              <div className="text-2xl">{prize.icon}</div>
              <div className="text-xs font-black text-white">{prize.label}</div>
              <div className="text-[10px] text-slate-400">{prize.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* How It Works Steps */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-pink-400 font-bold text-xs">
            <Ticket className="size-4" />
            <span>Step 1: Top Up</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Order your favorite game diamonds or social media boost via KHQR / ABA PayWay.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
            <Gift className="size-4" />
            <span>Step 2: Spin the Wheel</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Every paid order unlocks 1 guaranteed spin on the Lucky Draw Wheel right after payment.
          </p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
            <Sparkles className="size-4" />
            <span>Step 3: Redeem Vouchers</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Collect loyalty points and discount voucher codes to save money on future orders!
          </p>
        </div>
      </div>

      {/* Back to store CTA */}
      <div className="text-center pt-2">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-colors"
        >
          <span>Return to Storefront</span>
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}
