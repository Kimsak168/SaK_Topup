"use client";

import Link from "next/link";
import {
  ArrowRight,
  Gift,
  ShieldCheck,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";
import { SpiderWebSvg } from "./HalloweenAccents";
import styles from "./LuckyDrawHeroBanner.module.css";

interface LuckyDrawHeroBannerProps {
  onSpinClick?: () => void;
}

export function LuckyDrawHeroBanner({ onSpinClick }: LuckyDrawHeroBannerProps) {
  const handleScrollToWheel = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onSpinClick) {
      onSpinClick();
      return;
    }
    window.dispatchEvent(new CustomEvent("open-lucky-draw"));
  };

  return (
    <div
      data-banner="lucky-draw-hero"
      className={`lucky-draw-banner ${styles.bannerWrapper}`}
    >
      {/* Water Festival ripples in both top corners */}
      <SpiderWebSvg className={styles.spiderwebLeft} />
      <SpiderWebSvg className={styles.spiderwebRight} />

      {/* Background neon ambient glows */}
      <div aria-hidden="true" className={styles.glowGold} />
      <div aria-hidden="true" className={styles.glowCyan} />
      <div aria-hidden="true" className={styles.glowPink} />

      {/* Subtle decorative grid background */}
      <div aria-hidden="true" className={styles.gridPattern} />

      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 lg:gap-8">
        {/* ======================================================== */}
        {/* LEFT SECTION (58% on desktop)                           */}
        {/* ======================================================== */}
        <div className="flex-1 lg:max-w-[58%] space-y-4">
          {/* Header Badges with Gold & Water Festival tags */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={styles.badgeGold}>
              <Gift className="size-3.5 text-amber-300" />
              <span>🎁 ASURA LUCKY DRAW</span>
            </span>
            <span className={styles.badgeWaterFest}>
              <span>🚣‍♂️</span>
              <span>បុណ្យអុំទូក WATER FESTIVAL</span>
            </span>
            <span className={styles.badgeGuarantee}>
              <Sparkles className="size-3 text-emerald-300" />
              <span>100% WIN GUARANTEED</span>
            </span>
          </div>

          {/* Headline & Description */}
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className={styles.bannerTitle}>
                Free Fire &amp; MLBB Lucky Draw
              </h1>
              <span className={styles.badgeDaily}>
                Buyer Exclusive
              </span>
            </div>
            <p className={styles.bannerSubtitle}>
              បង្វិលកង់សំណាងឈ្នះ Free Fire Weekly Membership, MLBB Weekly Diamond Pass, Diamonds និង Discount Vouchers!
            </p>
          </div>

          {/* 4 Prize Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            {/* Card 1: FF Weekly Membership */}
            <div className={styles.rewardCard}>
              <span
                className={styles.cardIconBox}
                style={{
                  background: "rgba(239, 68, 68, 0.2)",
                  boxShadow: "0 0 12px rgba(239, 68, 68, 0.35)",
                }}
              >
                🔥
              </span>
              <div className="min-w-0">
                <div className={styles.rewardCardTitle}>FF Weekly</div>
                <div className={styles.rewardCardMeta} style={{ color: "#FCA5A5" }}>
                  Membership
                </div>
              </div>
            </div>

            {/* Card 2: MLBB Weekly Diamond Pass */}
            <div className={styles.rewardCard}>
              <span
                className={styles.cardIconBox}
                style={{
                  background: "rgba(139, 92, 246, 0.2)",
                  boxShadow: "0 0 12px rgba(139, 92, 246, 0.35)",
                }}
              >
                👑
              </span>
              <div className="min-w-0">
                <div className={styles.rewardCardTitle}>MLBB Weekly</div>
                <div className={styles.rewardCardMeta} style={{ color: "#C4B5FD" }}>
                  Diamond Pass
                </div>
              </div>
            </div>

            {/* Card 3: Free Fire & MLBB Diamonds */}
            <div className={styles.rewardCard}>
              <span
                className={styles.cardIconBox}
                style={{
                  background: "rgba(56, 189, 248, 0.22)",
                  boxShadow: "0 0 12px rgba(56, 189, 248, 0.4)",
                }}
              >
                💎
              </span>
              <div className="min-w-0">
                <div className={styles.rewardCardTitle}>Bonus Diamonds</div>
                <div className={styles.rewardCardMeta} style={{ color: "#7DD3FC" }}>
                  Up to 50 Dia
                </div>
              </div>
            </div>

            {/* Card 4: Pass & Top-Up Vouchers */}
            <div className={styles.rewardCard}>
              <span
                className={styles.cardIconBox}
                style={{
                  background: "rgba(236, 72, 153, 0.2)",
                  boxShadow: "0 0 12px rgba(236, 72, 153, 0.35)",
                }}
              >
                🎟️
              </span>
              <div className="min-w-0">
                <div className={styles.rewardCardTitle}>Pass Vouchers</div>
                <div className={styles.rewardCardMeta} style={{ color: "#F472B6" }}>
                  Up to $0.50 OFF
                </div>
              </div>
            </div>
          </div>

          {/* 3 Trust Indicators */}
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3.5 pt-1">
            <span className={styles.trustPill}>
              <Zap className="size-3.5 text-amber-400 fill-amber-400" />
              <span>⚡ Instant Auto Redeem</span>
            </span>
            <span className={styles.trustPill}>
              <ShieldCheck className="size-3.5 text-emerald-400" />
              <span>🛡️ 100% Safe (No Password)</span>
            </span>
            <span className={styles.trustPill}>
              <Trophy className="size-3.5 text-sky-400" />
              <span>🎁 1 Guaranteed Spin Per Order</span>
            </span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* RIGHT SECTION (28% on desktop)                          */}
        {/* Glassmorphism Prize Showcase Card                       */}
        {/* ======================================================== */}
        <div className={`shrink-0 lg:w-[28%] ${styles.showcaseCard}`}>
          <div>
            <div className="flex items-center justify-between text-[11px] font-black text-amber-300">
              <span className="tracking-wider uppercase">TOP JACKPOT</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-[10px]">
                🔥 100% WIN
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-white tracking-tight drop-shadow-md">
                WEEKLY PASS
              </span>
            </div>

            <p className="mt-2 text-xs text-slate-300 leading-relaxed">
              Win <strong className="text-amber-300">Free Fire Weekly Membership</strong> or <strong className="text-purple-300">MLBB Weekly Pass</strong> on every top-up!
            </p>

            <div className="mt-3 flex items-center gap-2 text-[11px] font-bold text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Exclusive for Paying Clients</span>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-white/10">
            <a
              href="#wheel-section"
              onClick={handleScrollToWheel}
              className={styles.spinCtaButton}
            >
              <span>🎡 Spin the Wheel Now</span>
              <ArrowRight className="size-4 shrink-0 transition-transform duration-200" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

