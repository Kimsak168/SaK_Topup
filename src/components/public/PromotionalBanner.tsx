"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PublicBanner } from "@/lib/services/bannerService";

interface PromotionalBannerProps {
  banners: PublicBanner[];
}

export function PromotionalBanner({ banners }: PromotionalBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartXRef = useRef<number | null>(null);

  // Exactly four configurable banner slots from MongoDB / image storage
  const slides = banners.filter((b) => Boolean(b.imageUrl)).slice(0, 4);

  const nextSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % slides.length);
  }, [slides.length]);

  const prevSlide = useCallback(() => {
    if (slides.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + slides.length) % slides.length);
  }, [slides.length]);

  // Automatically switch to next banner every 5 seconds, looping after the last banner
  useEffect(() => {
    if (slides.length <= 1 || isPaused) return;
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [slides.length, isPaused, nextSlide]);

  // Touch and swipe gestures for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null) return;
    const diff = touchStartXRef.current - e.changedTouches[0].clientX;
    if (diff > 40) {
      nextSlide();
    } else if (diff < -40) {
      prevSlide();
    }
    touchStartXRef.current = null;
  };

  if (!slides.length) return null;

  return (
    <div
      role="region"
      aria-label="Promotions"
      className="relative w-full space-y-3 select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Wide, Responsive Single-Banner Frame with Rounded Corners */}
      <div className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border bg-card shadow-soft transition-all hover:border-pink-500/30">
        {/* Smooth Horizontal Sliding Track */}
        <div
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {slides.map((banner, index) => {
            const artwork = (
              <div className="relative aspect-[2.4/1] sm:aspect-[2.8/1] md:aspect-[3.2/1] w-full overflow-hidden bg-card">
                {/* Ambient Blurred Background to prevent letterbox distortion */}
                <div className="absolute inset-0 opacity-20 blur-2xl scale-110 pointer-events-none">
                  <Image
                    src={banner.imageUrl}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>

                {/* Main Clean Banner Image without text/badge overlays */}
                <Image
                  src={banner.imageUrl}
                  alt={banner.title || `Promotional banner ${index + 1}`}
                  fill
                  unoptimized
                  priority={index === 0}
                  sizes="(max-width: 1500px) 92vw, 1500px"
                  className="object-contain relative z-10 transition-transform duration-500 group-hover:scale-[1.01]"
                />
              </div>
            );

            return (
              <div key={banner.id || index} className="w-full shrink-0">
                {banner.targetUrl ? (
                  <Link
                    href={banner.targetUrl}
                    className="block focus-visible:outline-2 focus-visible:outline-ring focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {artwork}
                  </Link>
                ) : (
                  artwork
                )}
              </div>
            );
          })}
        </div>

        {/* Left and Right Navigation Arrow Buttons */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={prevSlide}
              aria-label="Previous banner"
              className="absolute left-2.5 sm:left-4 top-1/2 -translate-y-1/2 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-card/95 backdrop-blur-md border border-border text-foreground hover:text-primary-foreground hover:bg-primary hover:border-pink-500 transition-all opacity-90 sm:opacity-70 sm:group-hover:opacity-100 focus-visible:opacity-100 z-20 cursor-pointer shadow-soft active:scale-95"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next banner"
              className="absolute right-2.5 sm:right-4 top-1/2 -translate-y-1/2 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-card/95 backdrop-blur-md border border-border text-foreground hover:text-primary-foreground hover:bg-primary hover:border-pink-500 transition-all opacity-90 sm:opacity-70 sm:group-hover:opacity-100 focus-visible:opacity-100 z-20 cursor-pointer shadow-soft active:scale-95"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </div>

      {/* Navigation Dots Below the Banner (highlighting active banner) */}
      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentIndex(i)}
              aria-label={`Go to banner ${i + 1}`}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                i === currentIndex
                  ? "w-8 bg-gradient-to-r from-pink-500 via-rose-500 to-purple-500 shadow-[0_0_10px_rgba(255,46,147,0.7)]"
                  : "w-2 bg-input hover:bg-primary"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
