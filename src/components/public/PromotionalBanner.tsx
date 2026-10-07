"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import type { PublicBanner } from "@/lib/services/bannerService";

interface PromotionalBannerProps {
  banners: PublicBanner[];
}

export function PromotionalBanner({ banners }: PromotionalBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const touchStartXRef = useRef<number | null>(null);

  // Exactly four configurable banner slots from MongoDB / image storage
  const slides = banners.slice(0, 4);
  const activeIndex = slides.length ? currentIndex % slides.length : 0;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncMotion = () => setReduceMotion(media.matches);
    const syncVisibility = () => setIsVisible(!document.hidden);
    syncMotion();
    syncVisibility();
    media.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      media.removeEventListener("change", syncMotion);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

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
    if (slides.length <= 1 || isPaused || pauseRequested || hasFocus || reduceMotion || !isVisible) return;
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [slides.length, isPaused, pauseRequested, hasFocus, reduceMotion, isVisible, nextSlide]);

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

  if (!slides.length) {
    return <div role="status" className="rounded-2xl border border-border bg-card px-6 py-10 text-center text-muted-foreground">No promotional banners are available right now.</div>;
  }

  return (
    <div
      role="region"
      aria-label="Promotions"
      aria-roledescription="carousel"
      className="relative w-full space-y-3 select-none"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setHasFocus(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false);
      }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Wide, Responsive Single-Banner Frame with Rounded Corners */}
      <div className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-[#F8DCE9] bg-white shadow-xs transition-all hover:border-[#F4C7DD]">
        {/* Smooth Horizontal Sliding Track */}
        <div
          className="flex transition-transform duration-500 ease-in-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${activeIndex * 100}%)` }}
        >
          {slides.map((banner, index) => {
            const artwork = (
              <div className="relative w-full overflow-hidden bg-white h-[138px] sm:h-auto" style={{ aspectRatio: "5 / 2" }}>
                {!banner.imageUrl || failedImages[banner.imageUrl] ? (
                  <div role="status" className="flex h-full w-full items-center justify-center px-12 text-center text-sm text-[#64748B]">
                    {banner.title || `Promotional banner ${index + 1}`} image is temporarily unavailable.
                  </div>
                ) : (
                  <Image
                    src={banner.imageUrl}
                    alt={banner.title || `Promotional banner ${index + 1}`}
                    fill
                    preload={index === 0}
                    loading={index === 0 ? undefined : "lazy"}
                    sizes="(max-width: 1630px) 92vw, 1500px"
                    className="object-cover object-center transition-transform duration-500 group-hover:scale-[1.01]"
                    onError={(event) => {
                      console.error("[PromotionalBanner] Image failed to load", {
                        originalUrl: banner.imageUrl,
                        requestedUrl: event.currentTarget.currentSrc,
                      });
                      setFailedImages((previous) => ({ ...previous, [banner.imageUrl]: true }));
                    }}
                  />
                )}
              </div>
            );

            return (
              <div key={banner.id || index} className="w-full shrink-0" inert={index !== activeIndex} aria-hidden={index !== activeIndex}>
                {banner.targetUrl ? (
                  <Link
                    href={banner.targetUrl}
                    className="block focus-visible:outline-2 focus-visible:outline-[#EC168C] focus-visible:ring-2 focus-visible:ring-[#EC168C]/20"
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
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 flex h-7 w-7 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-white/90 sm:bg-white/95 border border-[#F4C7DD] text-[#1E293B] hover:text-white hover:bg-[#EC168C] transition-colors z-20 shadow-xs"
            >
              <ChevronLeft className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
            </button>

            <button
              type="button"
              onClick={nextSlide}
              aria-label="Next banner"
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 flex h-7 w-7 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-white/90 sm:bg-white/95 border border-[#F4C7DD] text-[#1E293B] hover:text-white hover:bg-[#EC168C] transition-colors z-20 shadow-xs"
            >
              <ChevronRight className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
            </button>
          </>
        )}
      </div>

      {/* Navigation Dots Below the Banner (highlighting active banner) */}
      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-0.5 sm:gap-1">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCurrentIndex(i)}
              aria-label={`Go to banner ${i + 1}`}
              aria-current={i === activeIndex ? "true" : undefined}
              className="flex h-7 w-7 sm:h-11 sm:w-11 items-center justify-center rounded-full"
            >
              <span className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${i === activeIndex ? "w-5 sm:w-6 bg-[#EC168C]" : "w-1.5 bg-[#F4C7DD]"}`} />
            </button>
          ))}
          {!reduceMotion && <button type="button" onClick={() => setPauseRequested(!pauseRequested)} aria-label={pauseRequested ? "Play slideshow" : "Pause slideshow"} className="flex h-7 w-7 sm:h-11 sm:w-11 items-center justify-center rounded-full text-[#64748B] hover:bg-[#FFF1F7] hover:text-[#EC168C]">
            {pauseRequested ? <Play className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <Pause className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
          </button>}
        </div>
      )}
    </div>
  );
}
