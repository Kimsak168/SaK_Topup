"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, Zap, Flame, ChevronRight, ChevronLeft } from "lucide-react";

interface BannerSlide {
  id: string;
  badge: string;
  badgeColor: string;
  title: string;
  highlight: string;
  description: string;
  path: string;
  image: string;
  ctaText: string;
  discount: string;
}

const BANNERS: BannerSlide[] = [
  {
    id: "free-fire",
    badge: "VIZO EXCLUSIVE",
    badgeColor: "from-pink-500 to-rose-500",
    title: "Free Fire Diamonds",
    highlight: "Double Diamond Bonus",
    description: "Instant direct recharge to your UID. Official Vizo API integration with zero delay and highest security.",
    path: "/games/vizo/freefire_global",
    image: "https://api.g2bulk.com/images/freefire_global.png",
    ctaText: "Top Up Free Fire",
    discount: "Extra +10% Bonus",
  },
  {
    id: "pubg-mobile",
    badge: "G2BULK SPECIAL",
    badgeColor: "from-amber-500 to-orange-500",
    title: "PUBG Mobile UC",
    highlight: "Royale Pass & UC Crates",
    description: "Recharge your PUBG Mobile Unknown Cash instantly. Fastest automated fulfillment direct to your Character ID.",
    path: "/games/g2bulk/pubgm",
    image: "https://api.g2bulk.com/images/pubgm.png",
    ctaText: "Top Up PUBG Mobile",
    discount: "Instant 60s Delivery",
  },
  {
    id: "mobile-legends",
    badge: "BESTSELLER",
    badgeColor: "from-purple-500 to-indigo-500",
    title: "Mobile Legends: Bang Bang",
    highlight: "Weekly Diamond Pass & Diamonds",
    description: "Get maximum value with Weekly Diamond Pass & instant Starlight diamonds. Safe, anti-ban guaranteed via G2Bulk.",
    path: "/games/g2bulk/mlbb",
    image: "https://api.g2bulk.com/images/mlbb.png",
    ctaText: "Top Up MLBB",
    discount: "Up to 30% Off",
  },
];

export function PromotionalBanner() {
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % BANNERS.length);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const slide = BANNERS[currentSlide];

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-pink-500/25 bg-[#0b0e24] shadow-[0_0_50px_-10px_rgba(255,46,147,0.25)]">
      {/* Banner Image Container */}
      <div className="relative h-[340px] sm:h-[400px] md:h-[440px] w-full overflow-hidden">
        <Image
          src={slide.image}
          alt={slide.title}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 1200px"
          className="object-cover object-center transition-all duration-700 brightness-[0.75] hover:scale-105"
        />

        {/* Ambient Gradient Overlays for Readability and Neon Atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#070814] via-[#070814]/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#070814]/90 via-[#070814]/60 to-transparent" />

        {/* Banner Content */}
        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 md:p-12 z-10">
          <div className="max-w-xl space-y-3 sm:space-y-4">
            {/* Badges */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider text-white bg-gradient-to-r ${slide.badgeColor} shadow-lg`}
              >
                <Flame className="h-3.5 w-3.5 fill-white" />
                {slide.badge}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-pink-300 bg-pink-500/20 border border-pink-500/30">
                <Sparkles className="h-3 w-3 text-pink-400" />
                {slide.discount}
              </span>
            </div>

            {/* Title */}
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-slate-300">
                {slide.title}
              </p>
              <h2 className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-md">
                {slide.highlight}
              </h2>
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 sm:line-clamp-none max-w-lg leading-relaxed">
              {slide.description}
            </p>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <Link
                href={slide.path}
                className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white shadow-[0_0_25px_rgba(255,46,147,0.5)] gradient-btn-saksuuu hover:scale-105 transition-all"
              >
                <Zap className="h-4 w-4 fill-white" />
                {slide.ctaText}
                <ChevronRight className="h-4 w-4" />
              </Link>

              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-xs font-medium text-slate-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                Fulfillment: Under 60s
              </div>
            </div>
          </div>
        </div>

        {/* Carousel slide indicators & controls */}
        <div className="absolute bottom-5 right-6 z-20 flex items-center gap-2">
          <button
            onClick={() =>
              setCurrentSlide((prev) => (prev === 0 ? BANNERS.length - 1 : prev - 1))
            }
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 border border-white/10 text-white hover:bg-pink-500/30 hover:border-pink-500/50 transition-colors"
            aria-label="Previous banner"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="flex gap-1.5 px-2">
            {BANNERS.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === currentSlide
                    ? "w-7 bg-pink-500 shadow-[0_0_10px_#ff2e93]"
                    : "w-2 bg-white/30 hover:bg-white/60"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
          </div>

          <button
            onClick={() => setCurrentSlide((prev) => (prev + 1) % BANNERS.length)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-black/50 border border-white/10 text-white hover:bg-pink-500/30 hover:border-pink-500/50 transition-colors"
            aria-label="Next banner"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
