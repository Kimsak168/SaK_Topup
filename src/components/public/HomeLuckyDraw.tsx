"use client";

import Link from "next/link";
import { Trophy, Sparkles, ArrowRight, Gift } from "lucide-react";
import { LuckyDrawWheel } from "./LuckyDrawWheel";

export function HomeLuckyDraw() {
  return (
    <section id="lucky-draw" className="my-10 sm:my-16 scroll-mt-24" aria-label="Asura Lucky Draw & Rewards Wheel">
      <div className="relative overflow-hidden rounded-3xl border border-amber-400/35 bg-gradient-to-br from-[#120B24] via-[#1E1138] to-[#0D1527] p-6 sm:p-10 shadow-2xl shadow-purple-950/40">
        {/* Ambient background glows */}
        <div className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 size-72 rounded-full bg-sky-500/20 blur-3xl" />

        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
          {/* Left Column: Description & CTAs */}
          <div className="flex-1 space-y-4 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black uppercase tracking-wider shadow-sm">
              <Sparkles className="size-3.5 text-amber-400" />
              <span>🎁 Lucky Draw &amp; Rewards · 100% Win</span>
            </div>

            <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
              Spin the Wheel &amp; Win Free Game Rewards!
            </h2>

            <p className="text-xs sm:text-sm text-slate-300 max-w-lg leading-relaxed mx-auto lg:mx-0">
              Every customer gets a <strong className="text-amber-300">Free Daily Spin</strong> plus <strong className="text-pink-400">Bonus Spins</strong> on every paid top-up order! Win instant discount vouchers, loyalty points, TikTok views, and game diamonds.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 max-w-lg mx-auto lg:mx-0 text-left">
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-center">
                <span className="text-lg">💎</span>
                <p className="text-[10px] font-bold text-white mt-1">Free Diamonds</p>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-center">
                <span className="text-lg">🎟️</span>
                <p className="text-[10px] font-bold text-white mt-1">Discount Codes</p>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-center">
                <span className="text-lg">🎁</span>
                <p className="text-[10px] font-bold text-white mt-1">Reward Points</p>
              </div>
              <div className="p-2.5 rounded-xl bg-black/40 border border-white/10 text-center">
                <span className="text-lg">🚀</span>
                <p className="text-[10px] font-bold text-white mt-1">TikTok Views</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 pt-3">
              <Link
                href="/lucky-draw"
                className="px-6 py-3 rounded-full bg-gradient-to-r from-amber-400 via-pink-500 to-sky-400 hover:opacity-95 text-slate-950 font-black text-xs sm:text-sm transition-all shadow-lg shadow-pink-500/30 flex items-center gap-2 cursor-pointer active:scale-95"
              >
                <Trophy className="size-4" />
                <span>Claim Order Spins</span>
                <ArrowRight className="size-4" />
              </Link>

              <Link
                href="/#games"
                className="px-5 py-3 rounded-full border border-white/20 bg-white/5 hover:bg-white/10 text-white font-bold text-xs sm:text-sm transition-colors flex items-center gap-1.5"
              >
                <span>Top Up Game Now</span>
              </Link>
            </div>
          </div>

          {/* Right Column: Live Wheel Ready to Spin */}
          <div className="w-full lg:w-auto shrink-0 flex justify-center">
            <LuckyDrawWheel isOpen={true} />
          </div>
        </div>
      </div>
    </section>
  );
}
