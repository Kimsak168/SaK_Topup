import Link from "next/link";
import {
  ArrowRight,
  Headphones,
  Heart,
  Play,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { SpiderWebSvg } from "./HalloweenAccents";
import styles from "./BoostTikTokKhmerBanner.module.css";

export function BoostTikTokKhmerBanner() {
  return (
    <div
      data-banner="tiktok-boost"
      className={`boost-tiktok-banner ${styles.bannerWrapper}`}
    >
      {/* Spiderwebs for Halloween celebration in both top corners */}
      <SpiderWebSvg className={styles.spiderwebLeft} />
      <SpiderWebSvg className={styles.spiderwebRight} />

      {/* Background neon ambient glows */}
      <div aria-hidden="true" className={styles.glowPink} />
      <div aria-hidden="true" className={styles.glowOrange} />
      <div aria-hidden="true" className={styles.glowViolet} />

      {/* Subtle decorative grid background */}
      <div aria-hidden="true" className={styles.gridPattern} />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 lg:gap-8">
        {/* ======================================================== */}
        {/* LEFT SECTION (53% on desktop)                           */}
        {/* ======================================================== */}
        <div className="flex-1 lg:max-w-[53%] space-y-4">
          {/* Header Badges with Sakura & Halloween tags */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={styles.badgePink}>
              <Zap className="size-3.5 text-[#FF249C] fill-[#FF249C] animate-pulse" />
              ⚡ BOOST TIKTOK KHMER
            </span>
            <span className={styles.badgeHalloween}>
              <span>🎃</span>
              <span>HALLOWEEN SPECIAL</span>
            </span>
            <span className={styles.badgePayway}>
              <span>KHQR / ABA PayWay</span>
            </span>
          </div>

          {/* Headline & Description */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className={styles.bannerTitle}>
                Boost TikTok Khmer
              </h2>
              <span className={styles.badgeFixed}>
                Fixed Packages
              </span>
            </div>
            <p className={styles.bannerSubtitle}>
              សេវាកម្មបង្កើន TikTok សម្រាប់អ្នកប្រើប្រាស់នៅកម្ពុជា — Likes, Views និង Followers
            </p>
          </div>

          {/* 3 Horizontal Service Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {/* Card 1: Likes + Views */}
            <div className={`${styles.serviceCard} ${styles.serviceCardLikes}`}>
              <span
                className={styles.cardIconBox}
                style={{
                  background: "rgba(255, 36, 156, 0.2)",
                  boxShadow: "0 0 12px rgba(255, 36, 156, 0.35)",
                }}
              >
                <Heart className="size-4 text-[#FF249C] fill-[#FF249C]" />
              </span>
              <div className="min-w-0">
                <div className={styles.serviceCardTitle}>
                  ❤️ Likes + Views
                </div>
                <div
                  className={styles.serviceCardMeta}
                  style={{ color: "#FBCFE8" }}
                >
                  500–10,000 Likes
                </div>
              </div>
            </div>

            {/* Card 2: Video Views */}
            <div className={`${styles.serviceCard} ${styles.serviceCardViews}`}>
              <span
                className={styles.cardIconBox}
                style={{
                  background: "rgba(168, 85, 247, 0.2)",
                  boxShadow: "0 0 12px rgba(168, 85, 247, 0.35)",
                }}
              >
                <Play className="size-4 text-[#C084FC] fill-[#C084FC]" />
              </span>
              <div className="min-w-0">
                <div className={styles.serviceCardTitle}>
                  ▶ Video Views
                </div>
                <div
                  className={styles.serviceCardMeta}
                  style={{ color: "#E9D5FF" }}
                >
                  2,000–10,000 Views
                </div>
              </div>
            </div>

            {/* Card 3: Real Followers */}
            <div className={`${styles.serviceCard} ${styles.serviceCardFollowers}`}>
              <span
                className={styles.cardIconBox}
                style={{
                  background: "rgba(249, 115, 22, 0.22)",
                  boxShadow: "0 0 12px rgba(249, 115, 22, 0.4)",
                }}
              >
                <Users className="size-4 text-[#FB923C]" />
              </span>
              <div className="min-w-0">
                <div className={styles.serviceCardTitle}>
                  👥 Real Followers
                </div>
                <div
                  className={styles.serviceCardMeta}
                  style={{ color: "#FED7AA" }}
                >
                  100–500 Followers
                </div>
              </div>
            </div>
          </div>

          {/* 3 Trust Indicators */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5 pt-1">
            <span className={styles.trustPill}>
              <Zap className="size-3.5 text-amber-400 fill-amber-400" />
              <span>⚡ Instant Auto Delivery</span>
            </span>
            <span className={styles.trustPill}>
              <ShieldCheck className="size-3.5 text-emerald-400" />
              <span>🛡️ 100% Safe (No Password)</span>
            </span>
            <span className={styles.trustPill}>
              <Headphones className="size-3.5 text-[#C084FC]" />
              <span>🎧 24/7 Support</span>
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* CENTER SECTION (22% on desktop)                         */}
        {/* 3D Smartphone with TikTok Display, Energy Rings & Pumpkin */}
        {/* ======================================================== */}
        <div className="hidden sm:flex lg:flex shrink-0 lg:w-[22%] justify-center items-center py-2 lg:py-0 relative">
          {/* Dual energy rings */}
          <div aria-hidden="true" className={styles.energyRingOuter} />
          <div aria-hidden="true" className={styles.energyRingInner} />

          {/* 3D Tilted Smartphone Mockup */}
          <div className={styles.phoneMockup}>
            {/* Cute Halloween Pumpkin perched on top corner of phone */}
            <span aria-hidden="true" className={styles.phonePumpkin}>
              🎃
            </span>

            {/* Phone shell */}
            <div className={styles.phoneShell}>
              {/* Dynamic Island */}
              <div className={styles.phoneIsland} />

              {/* Phone Screen */}
              <div className={styles.phoneScreen}>
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
            <div className={`${styles.microBadge} ${styles.badgeTopLeft}`}>
              <Heart className="size-3 text-[#FF249C] fill-[#FF249C]" />
              <span className={styles.microBadgeText}>+5K</span>
            </div>

            {/* 2. Bat FAST badge (top-right) */}
            <div className={`${styles.microBadge} ${styles.badgeTopRight}`}>
              <span className="text-[10px] leading-none select-none">🦇</span>
              <span className={styles.microBadgeText}>FAST</span>
            </div>

            {/* 3. Growth chart (bottom-left) */}
            <div className={`${styles.microBadge} ${styles.badgeBottomLeft}`}>
              <TrendingUp className="size-3 text-emerald-400" />
              <span className={styles.microBadgeText}>+250%</span>
            </div>

            {/* 4. Followers (bottom-right) */}
            <div className={`${styles.microBadge} ${styles.badgeBottomRight}`}>
              <Users className="size-3 text-purple-300" />
              <span className={styles.microBadgeText}>+500</span>
            </div>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT SECTION (25% on desktop)                          */}
        {/* Glassmorphism Pricing Card with High Contrast Colors     */}
        {/* ======================================================== */}
        <div className={`shrink-0 lg:w-[25%] ${styles.pricingCard}`}>
          <div>
            <div className={styles.pricingHeader}>
              <span className={styles.pricingLabel}>
                STARTING PRICE
              </span>
              <span className={styles.halloweenMiniTag}>
                <span>🎃</span>
                <span>DEAL</span>
              </span>
            </div>
            <div className={styles.priceDisplay}>
              <span className={styles.priceAmount}>
                $0.75
              </span>
              <span className={styles.priceUnit}>
                / package
              </span>
            </div>
            <div className={styles.availabilityNote}>
              <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Available 24/7 with KHQR</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10">
            <Link
              href="/services/tiktok-khmer"
              className={styles.ctaButton}
            >
              <span>ជ្រើសរើសកញ្ចប់ / Order Packages</span>
              <ArrowRight className="size-4 shrink-0 transition-transform duration-200" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
