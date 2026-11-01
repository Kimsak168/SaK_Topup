import Link from "next/link";
import {
  ArrowRight,
  Headphones,
  Heart,
  Play,
  Rocket,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export function BoostTikTokKhmerBanner() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#FF249C]/35 bg-gradient-to-br from-[#210B30] via-[#390D52] to-[#12041c] p-5 sm:p-7 md:p-8 text-white shadow-2xl shadow-[#FF249C]/20">
      {/* Background neon ambient glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 -top-24 size-72 rounded-full bg-[#FF249C]/20 blur-[90px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-1/4 -top-20 size-80 rounded-full bg-[#982BFF]/25 blur-[100px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -bottom-24 size-72 rounded-full bg-[#FF249C]/20 blur-[90px]"
      />

      {/* Decorative subtle grid background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04] bg-[radial-gradient(#FFFFFF_1px,transparent_1px)] [background-size:16px_16px]"
      />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 lg:gap-8">
        {/* ======================================================== */}
        {/* LEFT SECTION (55% on desktop)                           */}
        {/* ======================================================== */}
        <div className="flex-1 lg:max-w-[53%] space-y-4">
          {/* Header Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FF249C]/50 bg-[#FF249C]/20 px-3 py-1 text-[11px] sm:text-xs font-black tracking-wider text-[#FFC4ED] shadow-[0_0_15px_rgba(255,36,156,0.35)]">
              <Zap className="size-3.5 text-[#FF249C] fill-[#FF249C] animate-pulse" />
              ⚡ BOOST TIKTOK KHMER
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#982BFF]/40 bg-[#982BFF]/20 px-2.5 py-0.5 text-[11px] font-semibold text-[#FFC4ED]">
              <span>KHQR / ABA PayWay</span>
            </span>
          </div>

          {/* Headline & Description */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight text-white drop-shadow-[0_2px_12px_rgba(255,36,156,0.3)]">
                Boost TikTok Khmer
              </h2>
              <span className="rounded-full border border-[#FF249C]/40 bg-[#FF249C]/20 px-3 py-0.5 text-[11px] sm:text-xs font-bold text-[#FFC4ED] shadow-[0_0_10px_rgba(255,36,156,0.3)]">
                Fixed Packages
              </span>
            </div>
            <p className="mt-2 text-xs sm:text-sm text-[#FFC4ED]/90 leading-relaxed font-medium">
              សេវាកម្មបង្កើន TikTok សម្រាប់អ្នកប្រើប្រាស់នៅកម្ពុជា — Likes, Views និង Followers
            </p>
          </div>

          {/* 3 Horizontal Service Cards with Neon Borders */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {/* Card 1: Likes + Views */}
            <div className="group/card flex items-center gap-2.5 rounded-xl border border-[#FF249C]/35 bg-black/35 p-2.5 backdrop-blur-md transition-all duration-200 hover:border-[#FF249C] hover:shadow-[0_0_15px_rgba(255,36,156,0.3)]">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#FF249C]/20 text-[#FF249C] shadow-[0_0_10px_rgba(255,36,156,0.3)] group-hover/card:scale-110 transition-transform">
                <Heart className="size-4 fill-[#FF249C]" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] sm:text-xs font-bold text-white truncate">
                  ❤️ Likes + Views
                </div>
                <div className="text-[10px] text-[#FFC4ED]/80 font-medium">
                  500–10,000 Likes
                </div>
              </div>
            </div>

            {/* Card 2: Video Views */}
            <div className="group/card flex items-center gap-2.5 rounded-xl border border-[#982BFF]/35 bg-black/35 p-2.5 backdrop-blur-md transition-all duration-200 hover:border-[#982BFF] hover:shadow-[0_0_15px_rgba(152,43,255,0.3)]">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#982BFF]/20 text-[#982BFF] shadow-[0_0_10px_rgba(152,43,255,0.3)] group-hover/card:scale-110 transition-transform">
                <Play className="size-4 fill-[#982BFF]" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] sm:text-xs font-bold text-white truncate">
                  ▶ Video Views
                </div>
                <div className="text-[10px] text-[#FFC4ED]/80 font-medium">
                  2,000–10,000 Views
                </div>
              </div>
            </div>

            {/* Card 3: Real Followers */}
            <div className="group/card flex items-center gap-2.5 rounded-xl border border-fuchsia-500/35 bg-black/35 p-2.5 backdrop-blur-md transition-all duration-200 hover:border-fuchsia-400 hover:shadow-[0_0_15px_rgba(217,70,239,0.3)]">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-fuchsia-500/20 text-fuchsia-300 shadow-[0_0_10px_rgba(217,70,239,0.3)] group-hover/card:scale-110 transition-transform">
                <Users className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] sm:text-xs font-bold text-white truncate">
                  👥 Real Followers
                </div>
                <div className="text-[10px] text-[#FFC4ED]/80 font-medium">
                  100–500 Followers
                </div>
              </div>
            </div>
          </div>

          {/* 3 Trust Indicators */}
          <div className="flex flex-wrap items-center gap-3 sm:gap-4 pt-1 text-[11px] font-semibold text-[#FFC4ED]/90">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-0.5 border border-white/10">
              <Zap className="size-3.5 text-amber-400 fill-amber-400" />
              <span>⚡ Instant Auto Delivery</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-0.5 border border-white/10">
              <ShieldCheck className="size-3.5 text-emerald-400" />
              <span>🛡️ 100% Safe (No Password)</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-0.5 border border-white/10">
              <Headphones className="size-3.5 text-[#982BFF]" />
              <span>🎧 24/7 Support</span>
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CENTER SECTION (20% on desktop)                         */}
        {/* 3D Smartphone with TikTok Display & Neon Energy Rings    */}
        {/* ======================================================== */}
        <div className="hidden sm:flex lg:flex shrink-0 lg:w-[22%] justify-center items-center py-2 lg:py-0 relative">
          {/* Neon energy rings */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute size-48 md:size-56 rounded-full border-2 border-dashed border-[#FF249C]/40 animate-[spin_20s_linear_infinite]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute size-40 md:size-48 rounded-full border border-[#982BFF]/50 blur-[1px] animate-[spin_12s_linear_infinite_reverse]"
          />

          {/* 3D Tilted Smartphone Mockup */}
          <div className="relative z-10 transform -rotate-6 hover:rotate-0 transition-all duration-500 hover:scale-105 cursor-pointer">
            {/* Phone shell */}
            <div className="relative w-28 md:w-32 h-52 md:h-60 rounded-[28px] border-2 border-white/25 bg-gradient-to-b from-[#1b072a] via-[#0f0318] to-[#05010a] p-2 shadow-[0_15px_35px_rgba(255,36,156,0.35),0_0_20px_rgba(152,43,255,0.3)]">
              {/* Dynamic Island */}
              <div className="mx-auto h-2.5 w-12 rounded-full bg-black/80 border border-white/10 mb-2" />

              {/* Phone Screen */}
              <div className="relative h-[calc(100%-20px)] w-full rounded-[20px] bg-gradient-to-b from-[#2a0c3e] to-[#0a0212] overflow-hidden flex flex-col items-center justify-center p-2 border border-white/5">
                {/* TikTok Glowing Icon */}
                <div className="relative mb-2">
                  <div className="absolute -inset-2 rounded-full bg-[#FF249C]/40 blur-md animate-pulse" />
                  <svg
                    className="relative size-10 text-white drop-shadow-[2px_0_0_#24f6f0] drop-shadow-[-2px_0_0_#fe2c55]"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.298-.002.595.042.88.13V9.4a6.33 6.33 0 0 0-1-.08A6.34 6.34 0 0 0 3 15.66a6.34 6.34 0 0 0 10.82 4.5 6.3 6.3 0 0 0 1.86-4.49V8.69a8.18 8.18 0 0 0 4.91 1.62v-3.62z" />
                  </svg>
                </div>

                {/* Sub-label */}
                <span className="text-[9px] font-black tracking-wider text-[#FFC4ED] uppercase">
                  TikTok Boost
                </span>
                <span className="text-[8px] text-emerald-400 font-bold mt-0.5">
                  ● ACTIVE
                </span>
              </div>
            </div>

            {/* Floating micro badges around phone */}
            {/* 1. Heart badge (top-left) */}
            <div className="absolute -top-2 -left-4 flex items-center gap-1 rounded-full border border-[#FF249C]/60 bg-black/80 px-2 py-0.5 shadow-[0_0_12px_rgba(255,36,156,0.5)] backdrop-blur-md animate-bounce">
              <Heart className="size-3 text-[#FF249C] fill-[#FF249C]" />
              <span className="text-[9px] font-extrabold text-white">+5K</span>
            </div>

            {/* 2. Rocket badge (top-right) */}
            <div className="absolute top-4 -right-5 flex items-center gap-1 rounded-full border border-[#982BFF]/60 bg-black/80 px-2 py-0.5 shadow-[0_0_12px_rgba(152,43,255,0.5)] backdrop-blur-md">
              <Rocket className="size-3 text-cyan-300" />
              <span className="text-[9px] font-extrabold text-white">FAST</span>
            </div>

            {/* 3. Growth chart (bottom-left) */}
            <div className="absolute -bottom-2 -left-3 flex items-center gap-1 rounded-full border border-emerald-400/60 bg-black/80 px-2 py-0.5 shadow-[0_0_12px_rgba(52,211,153,0.4)] backdrop-blur-md">
              <TrendingUp className="size-3 text-emerald-400" />
              <span className="text-[9px] font-extrabold text-white">+250%</span>
            </div>

            {/* 4. Followers (bottom-right) */}
            <div className="absolute bottom-6 -right-4 flex items-center gap-1 rounded-full border border-pink-400/60 bg-black/80 px-2 py-0.5 shadow-[0_0_12px_rgba(255,36,156,0.4)] backdrop-blur-md">
              <Users className="size-3 text-pink-300" />
              <span className="text-[9px] font-extrabold text-white">+500</span>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT SECTION (25% on desktop)                          */}
        {/* Dark Glassmorphism Pricing Card with Neon Border         */}
        {/* ======================================================== */}
        <div className="shrink-0 lg:w-[25%] flex flex-col justify-between rounded-2xl border border-[#FF249C]/35 bg-black/40 p-4 sm:p-5 backdrop-blur-xl shadow-[0_0_30px_rgba(152,43,255,0.2)]">
          <div>
            <span className="text-[11px] font-extrabold text-[#FFC4ED]/75 block uppercase tracking-widest">
              STARTING PRICE
            </span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl sm:text-4xl font-black text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,36,156,0.5)]">
                $0.75
              </span>
              <span className="text-xs text-[#FFC4ED]/75 font-semibold">
                / package
              </span>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-400 font-semibold">
              <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Available 24/7 with KHQR</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10">
            <Link
              href="/services/tiktok-khmer"
              className="group/btn relative flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#FF249C] via-[#982BFF] to-[#FF249C] bg-[length:200%_auto] px-5 py-3 text-xs sm:text-sm font-black text-white shadow-[0_0_20px_rgba(255,36,156,0.45)] transition-all duration-300 hover:bg-right hover:scale-[1.03] hover:shadow-[0_0_25px_rgba(255,36,156,0.65)] active:scale-[0.98]"
            >
              <span>ជ្រើសរើសកញ្ចប់ / Order Packages</span>
              <ArrowRight className="size-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
